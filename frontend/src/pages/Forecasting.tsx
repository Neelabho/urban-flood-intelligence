import { useMemo, useState } from 'react'
import EChart, { AXIS } from '../components/EChart'
import { CI, Callout, ErrorBox, Kind, Loading, PageHeader, Panel, Section, Timestamp } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import type { Curves, Score } from '../lib/types'
import { predictLive } from '../lib/model'

type Rain = { generated_utc: string; conventions: Record<string, string>; date: string[]; imd_mean: (number | null)[]; imd_max: (number | null)[]; chirps_mean: (number | null)[]; era5_ist_day: (number | null)[]; era5_max1h: (number | null)[]; event: number[]; p_loyo: (number | null)[] }
type Dyn = {
  n_days: number; n_event_days: number
  product_comparison: { period: string; n_days: number; n_event_days: number; results: Record<string, { features: string[]; logistic_loyo: Score; univariate: Record<string, { roc_auc: number; pr_auc: number }>; curves: Curves }> }
  imd_heavy_rain_threshold_baseline: { tp: number; fp: number; fn: number; recall: number; precision: number }
  era5_full_period: Record<string, Score>
  lead_time: Record<string, Score>
  scenario_curve: { points: { rain_48h_mm: number; p_event_day: number }[]; assumption: string; note: string }
  live_model: { features: string[]; mean: number[]; scale: number[]; coef: number[]; intercept: number }
}

const PRODUCT_LABEL: Record<string, string> = {
  imd_gauge: 'IMD gauge grid (daily)', chirps_satellite: 'CHIRPS satellite (daily)', era5_reanalysis_daily: 'ERA5 reanalysis (daily)',
  era5_reanalysis_subdaily: 'ERA5 sub-daily intensities', imd_plus_era5_subdaily: 'IMD + ERA5 sub-daily',
}

export default function Forecasting() {
  const rain = useStatic<Rain>('kolkata/rainfall_daily.json')
  const models = useStatic<{ generated_utc: string; dynamic: Dyn }>('kolkata/models.json')
  const [year, setYear] = useState<number>(2025)
  const [scen, setScen] = useState(120)
  const [peak, setPeak] = useState(0.25)
  const d = models.data?.dynamic

  const years = useMemo(() => [...new Set((rain.data?.date ?? []).map((s) => Number(s.slice(0, 4))))], [rain.data])
  const tsOption = useMemo(() => {
    if (!rain.data) return null
    const R = rain.data
    const idx = R.date.map((s, i) => [s, i] as const).filter(([s]) => Number(s.slice(0, 4)) === year).map(([, i]) => i)
    const pick = <T,>(a: T[]) => idx.map((i) => a[i])
    const dates = pick(R.date)
    const evMarks = idx.filter((i) => R.event[i] === 1).map((i) => ({ xAxis: R.date[i] }))
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { fontSize: 11 } },
      grid: { left: 48, right: 48, top: 30, bottom: 56 },
      dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'shift', moveOnMouseWheel: false }, { type: 'slider', height: 18, bottom: 8 }],
      xAxis: { type: 'category', data: dates, ...AXIS },
      yAxis: [{ type: 'value', name: 'mm / day', ...AXIS }, { type: 'value', name: 'P(event)', min: 0, max: 1, ...AXIS, splitLine: { show: false } }],
      series: [
        { name: 'IMD max cell (gauge)', type: 'bar', data: pick(R.imd_max), itemStyle: { color: '#0f1b2d' }, barGap: '0%', markLine: { symbol: 'none', label: { show: false }, lineStyle: { color: '#a8322d', type: 'solid', width: 1.2 }, data: evMarks } },
        { name: 'CHIRPS mean (satellite)', type: 'bar', data: pick(R.chirps_mean), itemStyle: { color: '#d9a441' } },
        { name: 'ERA5 day (reanalysis)', type: 'bar', data: pick(R.era5_ist_day), itemStyle: { color: '#3d6a8e' } },
        { name: 'P(documented event day) — out-of-season CV', type: 'line', yAxisIndex: 1, data: pick(R.p_loyo), showSymbol: false, lineStyle: { color: '#d9762b', width: 1.6 } },
      ],
    }
  }, [rain.data, year])

  if (models.error) return <ErrorBox error={models.error} />
  const scenX = { era5_48h: scen, era5_max1h: scen * peak, era5_max3h: Math.min(scen, scen * peak * 2), era5_max6h: Math.min(scen, scen * peak * 2.8), era5_antecedent_72h: d?.live_model.mean[4] ?? 50 }
  const scenP = d ? predictLive(d.live_model, scenX) : null

  return (
    <div>
      <PageHeader eyebrow="Modules B & C" title="Rainfall-conditioned risk and forecasting limits">
        Urban waterlogging in Kolkata has no openly available hourly flood record, so no hourly flood-forecasting model can be validated.
        What can be validated is a <b>city-scale event-day model</b>: given rainfall, how likely is a day to appear in the documented waterlogging
        record? Below: rainfall history, product comparison, how skill decays as rainfall information is withheld, and a scenario tool.
      </PageHeader>

      <Section kicker="Rainfall history" title="Daily rainfall from three independent products" right={
        <label className="text-[12px] text-slate">Season{' '}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-line bg-white px-2 py-1">
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>}>
        <Panel note={<Timestamp iso={rain.data?.generated_utc} />}>
          {rain.loading ? <Loading /> : rain.error ? <ErrorBox error={rain.error} /> : tsOption && <EChart option={tsOption} height={340} />}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-mute">
            <span><Kind k="observed" /> IMD gauge grid</span><span><Kind k="observed" /> CHIRPS satellite estimate</span><span><Kind k="modelled" /> ERA5 reanalysis</span><span><Kind k="model" /> event-day probability</span>
            <span><span className="text-red">│</span> documented waterlogging day</span>
            {year === 2026 && <span className="text-orange">IMD 2026 gridded data not yet released — ERA5/CHIRPS only.</span>}
          </div>
        </Panel>
      </Section>

      {!d ? <Loading /> : (
        <>
          <Section kicker="RQ2" title="Does satellite rainfall discriminate event days better than gauge data?">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <Panel title={`Leave-one-season-out logistic models · ${d.product_comparison.period}`} note={`${d.product_comparison.n_event_days} event days / ${d.product_comparison.n_days} days`}>
                <table className="data">
                  <thead><tr><th>Rainfall information</th><th className="text-right">ROC-AUC [95% CI]</th><th className="text-right">PR-AUC</th><th className="text-right">Best single metric</th></tr></thead>
                  <tbody>
                    {Object.entries(d.product_comparison.results).map(([k, v]) => {
                      const bestU = Object.entries(v.univariate).sort((a, b) => b[1].roc_auc - a[1].roc_auc)[0]
                      return (
                        <tr key={k}><td>{PRODUCT_LABEL[k] ?? k}</td>
                          <td className="num text-right">{v.logistic_loyo.roc_auc.toFixed(3)}<CI ci={v.logistic_loyo.ci95_year_bootstrap?.roc_auc} /></td>
                          <td className="num text-right">{v.logistic_loyo.pr_auc.toFixed(3)}</td>
                          <td className="num text-right text-[11.5px]">{bestU[0]} {bestU[1].roc_auc.toFixed(2)}</td></tr>
                      )
                    })}
                    <tr><td>IMD "heavy rain" ≥ 64.5 mm (any cell)</td><td colSpan={3} className="num text-right text-[12px]">recall {fmt.pct(d.imd_heavy_rain_threshold_baseline.recall, 0)}, precision {fmt.pct(d.imd_heavy_rain_threshold_baseline.precision, 0)}</td></tr>
                  </tbody>
                </table>
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate">
                  Confidence intervals (year-cluster bootstrap) overlap for every product. <b>No product demonstrably outperforms the gauge grid.</b> CHIRPS is
                  also known to underestimate convective extremes (≈62 mm vs ≈250 mm observed on 22–23 Sep 2025). Prevalence is {fmt.pct(d.product_comparison.results.imd_gauge.logistic_loyo.prevalence, 2)},
                  so PR-AUC values of 0.1–0.2 are 10–20× the no-skill baseline.
                </p>
              </Panel>
              <Panel title="ROC curves (out-of-season predictions)">
                <EChart height={300} option={{
                  tooltip: { trigger: 'item' }, legend: { bottom: 0, textStyle: { fontSize: 10 } }, grid: { left: 40, right: 12, top: 10, bottom: 60 },
                  xAxis: { type: 'value', min: 0, max: 1, name: 'FPR', ...AXIS }, yAxis: { type: 'value', min: 0, max: 1, name: 'TPR', ...AXIS },
                  series: [...Object.entries(d.product_comparison.results).map(([k, v]) => ({ name: PRODUCT_LABEL[k] ?? k, type: 'line', showSymbol: false, data: v.curves.roc.fpr.map((x, i) => [x, v.curves.roc.tpr[i]]) })),
                    { name: 'chance', type: 'line', showSymbol: false, data: [[0, 0], [1, 1]], lineStyle: { type: 'dashed', color: '#bbb' } }],
                }} />
              </Panel>
            </div>
          </Section>

          <Section kicker="Forecast horizons" title="How skill decays when recent rainfall is withheld">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Panel title="ERA5 information cut-off before end of event day (2016–2026)">
                <EChart height={280} option={{
                  tooltip: { trigger: 'axis' }, grid: { left: 48, right: 16, top: 16, bottom: 36 },
                  xAxis: { type: 'category', data: Object.keys(d.lead_time).map((k) => k.replace('h', ' h')), name: 'cut-off', ...AXIS },
                  yAxis: { type: 'value', min: 0.3, max: 1, name: 'ROC-AUC', ...AXIS },
                  series: [
                    { type: 'line', data: Object.values(d.lead_time).map((s) => s.roc_auc), symbolSize: 7, lineStyle: { color: '#0f1b2d' }, itemStyle: { color: '#0f1b2d' },
                      markLine: { symbol: 'none', data: [{ yAxis: 0.5, label: { formatter: 'chance', fontSize: 10 }, lineStyle: { color: '#a8322d', type: 'dashed' } }] } },
                    { type: 'line', name: 'CI low', data: Object.values(d.lead_time).map((s) => s.ci95_year_bootstrap?.roc_auc[0]), lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { opacity: 0 }, stack: 'ci' },
                    { type: 'line', name: 'CI band', data: Object.values(d.lead_time).map((s) => (s.ci95_year_bootstrap ? s.ci95_year_bootstrap.roc_auc[1] - s.ci95_year_bootstrap.roc_auc[0] : null)), lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: '#3d6a8e', opacity: 0.15 }, stack: 'ci' },
                  ],
                }} />
              </Panel>
              <Panel title="Validated horizons">
                <table className="data">
                  <thead><tr><th>Requested horizon</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr><td>1 h, 3 h</td><td><span className="text-orange">Not available</span> — no hourly waterlogging labels</td></tr>
                    <tr><td>6 h</td><td>Diagnostic only: AUC {d.lead_time['6h'].roc_auc.toFixed(2)} with reanalysis rain up to 6 h before day end</td></tr>
                    <tr><td>12 h</td><td>Diagnostic only: AUC {d.lead_time['12h'].roc_auc.toFixed(2)}</td></tr>
                    <tr><td>24 h</td><td><span className="text-orange">No useful skill</span> (AUC {d.lead_time['24h'].roc_auc.toFixed(2)}) without forecast rainfall</td></tr>
                  </tbody>
                </table>
                <Callout tone="warn">These are information cut-off experiments on reanalysis rainfall, not operational forecasts. A real forecast would feed forecast rainfall
                  (with its own error) into the model; that chain has not been validated.</Callout>
              </Panel>
            </div>
          </Section>

          <Section kicker="Model comparison" title="Full-period event-day models (ERA5, 2016–2026)">
            <div className="overflow-x-auto border border-line bg-white">
              <table className="data">
                <thead><tr><th>Model</th><th className="text-right">ROC-AUC [95% CI]</th><th className="text-right">PR-AUC [95% CI]</th><th className="text-right">Event days</th></tr></thead>
                <tbody>{Object.entries(d.era5_full_period).map(([k, s]) => (
                  <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="num text-right">{s.roc_auc.toFixed(3)}<CI ci={s.ci95_year_bootstrap?.roc_auc} /></td><td className="num text-right">{s.pr_auc.toFixed(3)}<CI ci={s.ci95_year_bootstrap?.pr_auc} /></td><td className="num text-right">{s.n_pos}</td></tr>
                ))}</tbody>
              </table>
              <div className="border-t border-paper-2 px-3 py-2 text-[11.5px] text-mute">Lower than the 2016–2025 comparison because the 2026 season (8 event days) is included and ERA5 under-represents several of those events. The shallow boosted model does not beat logistic regression with this few events.</div>
            </div>
          </Section>

          <Section kicker="What-if" title="Scenario: documented-event likelihood for a given 48-hour rainfall">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              <Panel title="Scenario inputs" note={<Kind k="simulated" />}>
                <label className="block text-[12.5px] text-slate">48-hour rainfall total <span className="num font-semibold text-ink">{scen} mm</span>
                  <input type="range" min={0} max={300} step={5} value={scen} onChange={(e) => setScen(Number(e.target.value))} className="w-full" />
                </label>
                <label className="mt-3 block text-[12.5px] text-slate">Peak-hour share of total <span className="num font-semibold text-ink">{Math.round(peak * 100)}%</span>
                  <input type="range" min={0.05} max={0.5} step={0.01} value={peak} onChange={(e) => setPeak(Number(e.target.value))} className="w-full" />
                </label>
                <div className="mt-4 border-t border-paper-2 pt-3">
                  <div className="text-[11px] uppercase tracking-wide text-mute">Probability the day enters the documented record</div>
                  <div className="num text-3xl font-medium">{scenP === null ? '—' : fmt.pct(scenP, 1)}</div>
                  <p className="mt-1 text-[11.5px] leading-snug text-mute">{d.scenario_curve.note}. Antecedent 72 h fixed at its median. Max 3 h / 6 h derived from the peak share.</p>
                </div>
              </Panel>
              <Panel title="Scenario curve (fixed intensity profile)">
                <EChart height={260} option={{
                  tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%` }, grid: { left: 48, right: 16, top: 16, bottom: 36 },
                  xAxis: { type: 'category', data: d.scenario_curve.points.map((p) => p.rain_48h_mm), name: 'mm / 48 h', ...AXIS },
                  yAxis: { type: 'value', min: 0, max: 1, ...AXIS },
                  series: [{ type: 'line', data: d.scenario_curve.points.map((p) => p.p_event_day), smooth: true, lineStyle: { color: '#a8322d' }, itemStyle: { color: '#a8322d' }, areaStyle: { color: '#a8322d', opacity: 0.06 } }],
                }} />
                <p className="text-[11.5px] text-mute">{d.scenario_curve.assumption}</p>
              </Panel>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
