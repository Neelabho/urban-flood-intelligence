import { useEffect, useMemo, useState } from 'react'
import EChart, { AXIS } from '../components/EChart'
import { Callout, ErrorBox, Kind, Loading, PageHeader, Panel, Section, Stat } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import { predictLive } from '../lib/model'

type LiveModel = { features: string[]; mean: number[]; scale: number[]; coef: number[]; intercept: number; trained_on: string; output: string }
type OM = { hourly: { time: string[]; precipitation: (number | null)[] }; generationtime_ms: number; latitude: number; longitude: number }

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&hourly=precipitation&past_days=3&forecast_days=3&timezone=GMT'
const IST_MS = 5.5 * 3600e3

/** Features for IST calendar day starting at `dayStartUtcMs` (same definitions as the ERA5 training features). */
function features(times: number[], p: number[], dayStartUtcMs: number) {
  const end = dayStartUtcMs + 24 * 3600e3
  const inWin = (a: number, b: number) => times.map((t, i) => [t, p[i]] as const).filter(([t]) => t > a && t <= b).map(([, v]) => v)
  const w24 = inWin(end - 24 * 3600e3, end)
  const w48 = inWin(end - 48 * 3600e3, end)
  const ante = inWin(end - 120 * 3600e3, end - 48 * 3600e3)
  const roll = (a: number[], k: number) => a.reduce((m, _, i) => (i + 1 >= k ? Math.max(m, a.slice(i + 1 - k, i + 1).reduce((s, v) => s + v, 0)) : m), 0)
  return {
    era5_24h: w24.reduce((s, v) => s + v, 0), era5_48h: w48.reduce((s, v) => s + v, 0), era5_max1h: Math.max(0, ...w48),
    era5_max3h: roll(w48, 3), era5_max6h: roll(w48, 6), era5_antecedent_72h: ante.reduce((s, v) => s + v, 0),
    complete: w48.length === 48, anteHours: ante.length,
  }
}

export default function Live() {
  const models = useStatic<{ dynamic: { live_model: LiveModel } }>('kolkata/models.json')
  const [om, setOm] = useState<OM | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const load = () => {
    setErr(null)
    fetch(URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((j) => { setOm(j); setFetchedAt(new Date()) }).catch((e) => setErr(String(e.message || e)))
  }
  useEffect(load, [])

  const view = useMemo(() => {
    if (!om) return null
    const times = om.hourly.time.map((t) => Date.parse(t + 'Z'))
    const p = om.hourly.precipitation.map((v) => v ?? 0)
    const now = Date.now()
    const istNow = new Date(now + IST_MS)
    const todayStart = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_MS
    const days = [-1, 0, 1, 2].map((k) => {
      const s = todayStart + k * 86400e3
      return { label: k === -1 ? 'Yesterday' : k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : 'Day after', start: s, ...features(times, p, s), kind: s + 86400e3 <= now ? 'observed-ish' : 'forecast' }
    })
    return { times, p, now, days }
  }, [om])

  const lm = models.data?.dynamic.live_model
  return (
    <div>
      <PageHeader eyebrow="Live conditions · experimental" title="Current and forecast rainfall over Kolkata">
        Rainfall here is fetched live from the Open-Meteo forecast API (blend of national weather models) each time the page opens. It is a
        <b> rainfall forecast, not a flood forecast</b>. As an experiment, the forecast rainfall is passed through the event-day model trained on ERA5,
        which has not been validated on forecast inputs.
      </PageHeader>
      <Section>
        {err && <ErrorBox error={err} hint="Open-Meteo could not be reached. No live values are shown, and none are invented. Try again later." />}
        {!om && !err && <Loading what="live rainfall from Open-Meteo" />}
        {view && (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Hourly precipitation, past 3 days and next 3 days (city centre)" note={<span><Kind k="forecast" /> fetched {fetchedAt?.toLocaleTimeString()}</span>}>
              <EChart height={300} option={{
                tooltip: { trigger: 'axis' }, grid: { left: 44, right: 16, top: 16, bottom: 40 },
                xAxis: { type: 'time', ...AXIS }, yAxis: { type: 'value', name: 'mm / h', ...AXIS },
                series: [{ type: 'bar', data: view.times.map((t, i) => [t, view.p[i]]), itemStyle: { color: (pp: { value: [number, number] }) => (pp.value[0] > view.now ? '#a9c1d3' : '#3d6a8e') }, barMaxWidth: 6,
                  markLine: { symbol: 'none', data: [{ xAxis: view.now, label: { formatter: 'now', fontSize: 10 }, lineStyle: { color: '#a8322d' } }] } }],
              }} />
              <p className="text-[11.5px] text-mute">Dark bars: model analysis of past hours (not gauge observations). Light bars: forecast. Source: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0).</p>
              <button onClick={load} className="mt-2 border border-line px-3 py-1 text-[12px]">Refresh</button>
            </Panel>
            <Panel title="Rainfall-conditioned event-day likelihood (experimental)">
              {!lm ? <Loading /> : (
                <div className="space-y-3">
                  {view.days.map((d) => {
                    const pr = predictLive(lm, d)
                    return (
                      <div key={d.label} className="grid grid-cols-[90px_1fr_80px] items-center gap-2 border-b border-paper-2 pb-2 last:border-0">
                        <div><div className="text-[12.5px] font-semibold">{d.label}</div><div className="text-[10.5px] text-mute">{fmt.date(new Date(d.start + IST_MS).toISOString().slice(0, 10))}</div></div>
                        <div className="num text-[11.5px] text-slate">48 h {d.era5_48h.toFixed(1)} mm · peak {d.era5_max1h.toFixed(1)} mm/h{!d.complete && <span className="text-orange"> · incomplete window</span>}</div>
                        <div className="text-right"><div className="num text-lg">{fmt.pct(pr, 1)}</div><Kind k={d.kind === 'forecast' ? 'forecast' : 'model'} /></div>
                      </div>
                    )
                  })}
                  <Stat label="How to read this" value="" sub={`${lm.output}. Trained on ${lm.trained_on}. Values below ~5% are typical of dry or light-rain days; documented events usually follow 50+ mm in 48 h with intense hours.`} />
                </div>
              )}
            </Panel>
          </div>
        )}
        <div className="mt-4">
          <Callout tone="warn">Not an official warning. For alerts follow the <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">India Meteorological Department</a> and the Kolkata Municipal Corporation. Forecast models differ from the ERA5 reanalysis used for training (domain shift), and short convective bursts are often missed by forecasts.</Callout>
        </div>
      </Section>
    </div>
  )
}
