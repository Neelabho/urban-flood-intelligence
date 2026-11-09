import { Fragment, useState } from 'react'
import EChart, { AXIS } from '../components/EChart'
import { Callout, ErrorBox, Kind, Loading, PageHeader, Panel, Plain, Section, Stat, TechDetails, Timestamp } from '../components/ui'
import { fmt, useStatic } from '../lib/data'

type Cat = { id: string; title: string; provider: string; url: string; license: string; period: string; temporal_resolution: string; spatial_resolution: string; crs: string; format: string; nature: string; used_for: string; limitations: string; downloads: { path: string; downloaded_utc: string; bytes: number | null; sha256: string | null }[] }
type Q = {
  generated_utc: string
  catalog: Cat[]
  quality: {
    static_features: { n_cells: number; missing: Record<string, { n_missing: number; frac_missing: number }>; hand_missingness: { hand_missing_neighbour_share: number; hand_missing_neighbour_expected_if_random: number; interpretation: string } }
    imputation: { selected: string; rule: string; summary: Record<string, Record<string, { hand_mean_rmse_mean: number; hand_mean_rmse_sd: number }>>; safeguards: string[] }
    sentinel1: { acquisitions: number; by_orbit: Record<string, number>; by_year: Record<string, number>; partial_coverage_acquisitions_lt90pct: number; otsu_threshold_within_bounds_share: number; label_feasibility_test: Record<string, number | string> }
    rainfall: Record<string, number | string>
    osm: { buildings_mapped_cells_share: number; note: string }
  }
  manifest_summary: { n_artifacts: number; total_bytes: number; first_download: string; last_download: string }
  manifest: { dataset_id: string; path: string; source_url: string; downloaded_utc: string; bytes: number | null }[]
  sar_label_test: { date: string[]; new_built: number[]; new_crop: number[]; rain3: number[] }
  feasibility: { weights: Record<string, number>; scores: Record<string, { kolkata: number; mumbai: number; evidence: string; note?: string; post_hoc?: string }>; weighted_totals_base: Record<string, number>; sensitivity: Record<string, Record<string, number>>; decision: string; approach: string }
}

const NATURE_KIND = (n: string) => (n.startsWith('observed') ? 'observed' : n.startsWith('reanalysis') || n.startsWith('modelled') ? 'modelled' : n.startsWith('observational') || n.startsWith('compiled') ? 'reported' : 'derived')

export default function Observatory() {
  const q = useStatic<Q>('kolkata/data_quality.json')
  const [open, setOpen] = useState<string | null>(null)
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data) return <Loading what="data catalogue" />
  const Qd = q.data.quality
  const imp = Qd.imputation.summary
  const methods = Object.keys(imp.random)
  const f = q.data.feasibility
  return (
    <div>
      <PageHeader eyebrow="Data observatory" title="Where our information comes from">
        Everything on this website is built from public information. Here is what we used, in plain words, and what its weak spots are.
        <div className="mt-1"><Timestamp iso={q.data.generated_utc} label="Last updated" /></div>
      </PageHeader>
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Plain title="What we used">
            <ul className="space-y-2">
              <li><b>Past floods:</b> news reports that named flooded streets, and India's national record of flood disasters.</li>
              <li><b>Rain:</b> rain gauges run by the India Meteorological Department, rain estimated from satellites, and rain from global weather models.</li>
              <li><b>Land and buildings:</b> satellite maps of ground and building height, maps of what covers the ground (buildings, trees, water, fields), radar satellite images, and OpenStreetMap, the free map anyone can edit.</li>
              <li><b>People:</b> population estimates from the European Commission, based on the census and where buildings are.</li>
            </ul>
          </Plain>
          <Plain title="Weak spots to keep in mind">
            <ul className="list-disc space-y-2 pl-5">
              <li>News covers some places more than others, so less-reported areas may look safer than they are.</li>
              <li>The height maps include buildings, so they cannot show the true street level in dense areas.</li>
              <li>Rain gauges are far apart. On 23 September 2025, two neighbouring gauge squares showed 224 mm and 3 mm.</li>
              <li>Satellite rain estimates badly underestimated that same storm.</li>
              <li>For about 1 in 20 squares, part of the land-height information was missing and had to be estimated.</li>
              <li>Drains, pumps and sewers are not on any public map, so they are left out.</li>
            </ul>
          </Plain>
        </div>
      </Section>

      <TechDetails title="How did we get this? (full catalogue and quality checks)">
      <Section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Datasets" value={q.data.catalog.length} />
          <Stat label="Downloaded artefacts" value={q.data.manifest_summary.n_artifacts} sub={`${fmt.n(q.data.manifest_summary.total_bytes / 1e6, 0)} MB`} />
          <Stat label="First / last download" value={new Date(q.data.manifest_summary.first_download).toISOString().slice(0, 10)} sub={new Date(q.data.manifest_summary.last_download).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} />
          <Stat label="Cells with missing HAND" value={fmt.pct(Qd.static_features.missing.hand_mean?.frac_missing ?? 0)} sub={`imputed with ${Qd.imputation.selected}`} tone="warn" />
        </div>
      </Section>

      <Section kicker="Catalogue" title="Dataset catalogue">
        <div className="overflow-x-auto border border-line bg-white">
          <table className="data">
            <thead><tr><th>Dataset</th><th>Type</th><th>Period</th><th>Resolution</th><th>Licence</th><th /></tr></thead>
            <tbody>
              {q.data.catalog.map((c) => (
                <Fragment key={c.id}>
                  <tr className="cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <td><div className="font-medium">{c.title}</div><div className="text-[11px] text-mute">{c.provider}</div></td>
                    <td><Kind k={NATURE_KIND(c.nature)} /><div className="text-[11px] text-mute">{c.nature}</div></td>
                    <td className="text-[12px]">{c.period}<div className="text-[11px] text-mute">{c.temporal_resolution}</div></td>
                    <td className="text-[12px]">{c.spatial_resolution}<div className="text-[11px] text-mute">{c.crs}</div></td>
                    <td className="text-[12px]">{c.license}</td>
                    <td className="text-[11px] text-blue">{open === c.id ? 'hide' : 'details'}</td>
                  </tr>
                  {open === c.id && (
                    <tr><td colSpan={6} className="bg-paper">
                      <div className="grid gap-3 p-2 text-[12.5px] md:grid-cols-2">
                        <div><b>Source:</b> <a href={c.url.startsWith('http') ? c.url : undefined} target="_blank" rel="noreferrer">{c.url}</a><br /><b>Format:</b> {c.format}<br /><b>Used for:</b> {c.used_for}</div>
                        <div><b>Known limitations:</b> {c.limitations}</div>
                        <div className="md:col-span-2"><b>Downloads ({c.downloads.length}):</b>
                          <ul className="num mt-1 text-[11px]">{c.downloads.slice(0, 12).map((d) => <li key={d.path}>{d.downloaded_utc} · {d.path} · {d.bytes ? fmt.n(d.bytes / 1e6, 2) + ' MB' : ''} {d.sha256 ? '· sha256 ' + d.sha256.slice(0, 12) + '…' : ''}</li>)}</ul>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section kicker="Missingness & imputation" title="Height above nearest drainage (HAND) gaps">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Imputation evaluation (masked known values, 3 seeds)">
            <EChart height={260} option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { fontSize: 11 } }, grid: { left: 50, right: 10, top: 30, bottom: 50 },
              xAxis: { type: 'category', data: methods.map((m) => m.replace(/_/g, ' ')), ...AXIS, axisLabel: { rotate: 20, fontSize: 10, color: '#6b7280' } },
              yAxis: { type: 'value', name: 'RMSE (m)', ...AXIS },
              series: [{ name: 'random 10% mask', type: 'bar', data: methods.map((m) => imp.random[m].hand_mean_rmse_mean), itemStyle: { color: '#a9c1d3' } },
                { name: 'spatial-block 10% mask', type: 'bar', data: methods.map((m) => imp.spatial_block[m].hand_mean_rmse_mean), itemStyle: { color: '#0f1b2d' } }],
            }} />
            <p className="text-[12px] text-slate">Selected: <b>{Qd.imputation.selected}</b>, {Qd.imputation.rule}.</p>
          </Panel>
          <Panel title="Mechanism and safeguards">
            <p className="text-[12.5px] leading-relaxed text-slate">{Qd.static_features.hand_missingness.interpretation} Missing cells have a missing neighbour {fmt.pct(Qd.static_features.hand_missingness.hand_missing_neighbour_share, 0)} of the time versus {fmt.pct(Qd.static_features.hand_missingness.hand_missing_neighbour_expected_if_random, 0)} expected if random.</p>
            <ul className="mt-2 list-disc pl-5 text-[12.5px] text-slate">{Qd.imputation.safeguards.map((s) => <li key={s}>{s}</li>)}</ul>
            <div className="mt-2 text-[12px]"><b>Other missing fields:</b> {Object.entries(Qd.static_features.missing).map(([k, v]) => `${k} ${fmt.pct(v.frac_missing)}`).join(' · ')} (the OSM completeness ratio is undefined where no built-up area exists and is not a model input).</div>
          </Panel>
        </div>
      </Section>

      <Section kicker="Satellite" title="Sentinel-1: coverage and the label-feasibility test">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <Panel title={`${Qd.sentinel1.acquisitions} acquisitions (date × orbit)`}>
            <EChart height={200} option={{ tooltip: { trigger: 'axis' }, grid: { left: 36, right: 10, top: 10, bottom: 24 },
              xAxis: { type: 'category', data: Object.keys(Qd.sentinel1.by_year), ...AXIS }, yAxis: { type: 'value', ...AXIS },
              series: [{ type: 'bar', data: Object.values(Qd.sentinel1.by_year), itemStyle: { color: '#3d6a8e' } }] }} />
            <div className="text-[12px] text-slate">Orbits: {Object.entries(Qd.sentinel1.by_orbit).map(([k, v]) => `${k} ${v}`).join(' · ')}. {Qd.sentinel1.partial_coverage_acquisitions_lt90pct} acquisitions cover &lt;90% of the area (orbit D150 sees only the eastern edge). Sentinel-1B failed in Dec 2021, halving revisit for 2022–2024.</div>
          </Panel>
          <Panel title="New open water vs 3-day rainfall (258 same-orbit pairs)">
            <EChart height={220} option={{ tooltip: { trigger: 'item' }, legend: { top: 0, textStyle: { fontSize: 11 } }, grid: { left: 54, right: 10, top: 28, bottom: 34 },
              xAxis: { type: 'value', name: 'IMD 3-day rain (mm)', ...AXIS }, yAxis: { type: 'value', name: 'new-water fraction', ...AXIS },
              series: [{ name: 'built-up pixels', type: 'scatter', symbolSize: 5, data: q.data.sar_label_test.rain3.map((r, i) => [r, q.data!.sar_label_test.new_built[i]]), itemStyle: { color: '#a8322d' } },
                { name: 'cropland pixels', type: 'scatter', symbolSize: 5, data: q.data.sar_label_test.rain3.map((r, i) => [r, q.data!.sar_label_test.new_crop[i]]), itemStyle: { color: '#d9a441', opacity: 0.7 } }] }} />
            <p className="text-[12px] text-slate">Spearman ρ (built-up vs rain) = {Number(Qd.sentinel1.label_feasibility_test.spearman_built_vs_rain3d).toFixed(2)}; cropland ρ = {Number(Qd.sentinel1.label_feasibility_test.spearman_crop_vs_rain3d).toFixed(2)}. {String(Qd.sentinel1.label_feasibility_test.conclusion)}</p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Rainfall" title="Rainfall product quality">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="IMD daily vs ERA5 (Pearson r)" value={Number(Qd.rainfall.imd_vs_era5_daily_pearson).toFixed(2)} />
          <Stat label="ERA5 / IMD on wet days" value={fmt.pct(Number(Qd.rainfall.era5_to_imd_ratio_on_imd_wet_days_gt20mm), 0)} sub="reanalysis smooths peaks" tone="warn" />
          <Stat label="CHIRPS days unavailable" value={`${Qd.rainfall.chirps_days_missing} / ${Qd.rainfall.chirps_days_requested}`} sub="server HTTP 403; left missing" />
          <Stat label="IMD missing cells" value={String(Qd.rainfall.imd_missing_cells_in_study_area)} sub="2016–2025" />
        </div>
        <div className="mt-3"><Callout tone="warn">{String(Qd.rainfall.example_2025_09_23)}. Rainfall is never imputed; GPM IMERG is used only for event case studies because the anonymous mirror ends in May 2021 and multi-year extraction requires NASA Earthdata credentials.</Callout></div>
      </Section>

      <Section kicker="Pilot selection" title="City feasibility assessment (Kolkata vs Mumbai)">
        <Panel>
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Criterion</th><th className="text-right">Weight</th><th className="text-right">Kolkata</th><th className="text-right">Mumbai</th><th>Evidence (measured in this run)</th></tr></thead>
              <tbody>{Object.entries(f.scores).map(([k, v]) => (
                <tr key={k}><td className="whitespace-nowrap">{k.replace(/_/g, ' ')}</td><td className="num text-right">{fmt.pct(f.weights[k], 0)}</td><td className="num text-right">{v.kolkata}</td><td className="num text-right">{v.mumbai}</td><td className="text-[11.5px] text-slate">{v.evidence}{v.post_hoc && <div className="text-orange">Post hoc: {v.post_hoc}</div>}</td></tr>
              ))}
                <tr className="font-semibold"><td>Weighted total</td><td /><td className="num text-right">{f.weighted_totals_base.kolkata.toFixed(2)}</td><td className="num text-right">{f.weighted_totals_base.mumbai.toFixed(2)}</td><td /></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div><div className="eyebrow mb-1">Sensitivity</div><table className="data"><tbody>{Object.entries(f.sensitivity).map(([k, v]) => <tr key={k}><td className="text-[12px]">{k}</td><td className="num text-right">K {v.kolkata.toFixed(2)}</td><td className="num text-right">M {v.mumbai.toFixed(2)}</td></tr>)}</tbody></table></div>
            <div className="text-[12.5px] leading-relaxed text-slate"><b>Decision.</b> {f.decision}<br /><br /><b>Approach.</b> {f.approach}</div>
          </div>
        </Panel>
      </Section>

      <Section kicker="Provenance" title="Download manifest">
        <div className="max-h-[360px] overflow-y-auto border border-line bg-white">
          <table className="data"><thead><tr><th>Dataset</th><th>Local path</th><th>Downloaded (UTC)</th><th className="text-right">Size</th></tr></thead>
            <tbody>{q.data.manifest.map((m) => <tr key={m.dataset_id + m.path}><td className="text-[12px]">{m.dataset_id}</td><td className="num text-[11px]">{m.path}</td><td className="num text-[11px]">{m.downloaded_utc}</td><td className="num text-right text-[11px]">{m.bytes ? fmt.n(m.bytes / 1e6, 2) + ' MB' : 'n/a'}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-mute">Raw files are not redistributed; scripts in <code>src/flood_intelligence/ingestion</code> re-acquire them. OSM building counts: {fmt.pct(Qd.osm.buildings_mapped_cells_share, 0)} of cells contain mapped buildings. {Qd.osm.note}.</p>
      </Section>
      </TechDetails>
    </div>
  )
}
