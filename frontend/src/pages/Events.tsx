import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl'
import EChart, { AXIS } from '../components/EChart'
import MapCanvas from '../components/MapCanvas'
import { Callout, ErrorBox, Kind, Loading, PageHeader, Panel, Section } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import type { FloodEvent, LocalityFeature } from '../lib/types'

type Filter = 'all' | 'model' | 'localities' | 'archival'

export default function Events() {
  const ev = useStatic<{ generated_utc: string; events: FloodEvent[] }>('kolkata/events.json')
  const locs = useStatic<{ features: LocalityFeature[] }>('kolkata/localities.geojson')
  const [filter, setFilter] = useState<Filter>('model')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)

  const list = useMemo(() => {
    const all = [...(ev.data?.events ?? [])].sort((a, b) => b.date.localeCompare(a.date))
    return all.filter((e) => {
      if (filter === 'model' && !e.in_event_day_model) return false
      if (filter === 'localities' && e.n_localities === 0) return false
      if (filter === 'archival' && e.in_event_day_model) return false
      if (q && !(e.date.includes(q) || e.localities.some((l) => l.toLowerCase().includes(q.toLowerCase())) || e.sources.some((s) => (s.cause ?? '').toLowerCase().includes(q.toLowerCase())))) return false
      return true
    })
  }, [ev.data, filter, q])
  useEffect(() => {
    if (!sel && list.length) setSel(list[0].date)
  }, [list, sel])
  const cur = ev.data?.events.find((e) => e.date === sel)

  const onReady = useCallback((m: MLMap) => {
    mapRef.current = m
    m.addSource('ev', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer({ id: 'ev-c', type: 'circle', source: 'ev', paint: { 'circle-radius': 6, 'circle-color': '#a8322d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
    m.addLayer({ id: 'ev-l', type: 'symbol', source: 'ev', layout: { 'text-field': ['get', 'locality'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top' }, paint: { 'text-color': '#0f1b2d', 'text-halo-color': '#fff', 'text-halo-width': 1.2 } })
    setReady(true)
  }, [])
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready || !locs.data || !cur) return
    const feats = locs.data.features.filter((f) => f.properties.events.includes(cur.date))
    ;(m.getSource('ev') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats } as GeoJSON.FeatureCollection)
    if (feats.length) {
      const xs = feats.map((f) => f.geometry.coordinates[0])
      const ys = feats.map((f) => f.geometry.coordinates[1])
      m.fitBounds([[Math.min(...xs) - 0.01, Math.min(...ys) - 0.01], [Math.max(...xs) + 0.01, Math.max(...ys) + 0.01]], { padding: 30, maxZoom: 13.5, duration: 400 })
    }
  }, [cur, locs.data, ready])

  const perYear = useMemo(() => {
    const m = new Map<number, { loc: number; city: number; ifi: number }>()
    for (const e of ev.data?.events ?? []) {
      const r = m.get(e.year) ?? { loc: 0, city: 0, ifi: 0 }
      if (e.n_localities > 0) r.loc++
      else if (e.sources.some((s) => s.type.startsWith('news'))) r.city++
      else r.ifi++
      m.set(e.year, r)
    }
    const ys = [...m.keys()].sort()
    return { ys, rows: ys.map((y) => m.get(y)!) }
  }, [ev.data])

  if (ev.error) return <ErrorBox error={ev.error} />
  return (
    <div>
      <PageHeader eyebrow="Module D" title="Historical events catalogue">
        Every entry links to its original source. Event dates come from cited news reports (locality-level or city-level) and from the
        India Flood Inventory (IMD Disastrous Weather Events). Rainfall context and Sentinel-1 acquisitions near each date are attached.
        Mapped flood <em>extents</em> do not exist for these events; points are geocoded mentions.
      </PageHeader>
      <Section kicker="Timeline" title="Events per year by evidence type">
        <Panel>
          {ev.loading ? <Loading /> : (
            <EChart height={220} option={{
              tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { fontSize: 11 } }, grid: { left: 36, right: 12, top: 30, bottom: 30 },
              xAxis: { type: 'category', data: perYear.ys, ...AXIS }, yAxis: { type: 'value', minInterval: 1, ...AXIS },
              series: [
                { name: 'News — localities named', type: 'bar', stack: 'a', data: perYear.rows.map((r) => r.loc), itemStyle: { color: '#a8322d' } },
                { name: 'News — city-level', type: 'bar', stack: 'a', data: perYear.rows.map((r) => r.city), itemStyle: { color: '#d9762b' } },
                { name: 'India Flood Inventory', type: 'bar', stack: 'a', data: perYear.rows.map((r) => r.ifi), itemStyle: { color: '#3d6a8e' } },
              ],
            }} />
          )}
          <p className="text-[11.5px] text-mute">Uneven counts across years reflect archive accessibility and reporting practice, not flood frequency.</p>
        </Panel>
      </Section>
      <Section>
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <div className="border border-line bg-white">
            <div className="space-y-2 border-b border-paper-2 p-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search date, locality or cause" className="w-full border border-line px-2 py-1.5 text-[13px]" aria-label="Search events" />
              <div className="flex flex-wrap gap-1 text-[11.5px]">
                {(['model', 'localities', 'archival', 'all'] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`border px-2 py-0.5 ${filter === f ? 'border-ink bg-ink text-paper' : 'border-line text-slate'}`}>
                    {{ model: '2016–2026', localities: 'With localities', archival: 'Archival (IFI)', all: 'All' }[f]}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-mute">{list.length} events</div>
            </div>
            <ul className="max-h-[560px] overflow-y-auto">
              {list.map((e) => (
                <li key={e.date}>
                  <button onClick={() => setSel(e.date)} className={`block w-full border-b border-paper-2 px-3 py-2 text-left ${sel === e.date ? 'bg-paper' : 'hover:bg-[#fbfaf7]'}`}>
                    <div className="flex items-baseline justify-between"><span className="num text-[13px] font-medium">{fmt.date(e.date)}</span><span className="text-[11px] text-mute">{e.sources.length} source{e.sources.length > 1 ? 's' : ''}</span></div>
                    <div className="truncate text-[11.5px] text-slate">{e.n_localities ? e.localities.join(', ') : e.sources[0]?.cause ?? e.sources[0]?.summary ?? e.sources[0]?.type}</div>
                  </button>
                </li>
              ))}
              {!list.length && <li className="p-4 text-sm text-mute">No events match.</li>}
            </ul>
          </div>
          {!cur ? <Loading /> : (
            <div className="space-y-4">
              <Panel title={`${fmt.date(cur.date)} · ${cur.n_localities} named localities`} note={cur.source_confidence}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-[280px] border border-line">
                    {cur.n_localities ? <MapCanvas center={[88.36, 22.56]} zoom={11} className="h-full w-full" onReady={onReady} /> : <div className="flex h-full items-center justify-center p-4 text-center text-[12.5px] text-mute">No locality-level information for this event (city- or district-level source).</div>}
                  </div>
                  <div className="text-[12.5px]">
                    <div className="eyebrow mb-1">Rainfall context</div>
                    <table className="w-full">
                      <tbody>
                        <tr><td className="text-slate">IMD max cell, IMD day D / D+1 <Kind k="observed" /></td><td className="num text-right">{fmt.n(cur.rainfall.imd_max_cell_mm_day_D, 0)} / {fmt.n(cur.rainfall.imd_max_cell_mm_day_D1, 0)} mm</td></tr>
                        <tr><td className="text-slate">ERA5 48 h / peak hour <Kind k="modelled" /></td><td className="num text-right">{fmt.n(cur.rainfall.era5_48h_mm, 0)} mm / {fmt.n(cur.rainfall.era5_max1h_mm, 1)} mm</td></tr>
                        <tr><td className="text-slate">CHIRPS 48 h max cell <Kind k="observed" /></td><td className="num text-right">{fmt.n(cur.rainfall.chirps_max_cell_48h_mm, 0)} mm</td></tr>
                        <tr><td className="text-slate">Event-day probability (out-of-season CV) <Kind k="model" /></td><td className="num text-right">{cur.rainfall.p_event_day_loyo === undefined ? '—' : fmt.pct(cur.rainfall.p_event_day_loyo, 0)}</td></tr>
                      </tbody>
                    </table>
                    <div className="eyebrow mb-1 mt-3">Satellite evidence (Sentinel-1, day −1 to +3)</div>
                    {cur['sentinel1_within_-1_+3_days'].length === 0 ? <div className="text-mute">No acquisition in window.</div> : (
                      <ul className="space-y-0.5">{cur['sentinel1_within_-1_+3_days'].map((s) => (
                        <li key={s.date + s.orbit} className="num text-[11.5px]">{s.date} {s.time_utc} UTC · {s.orbit} · coverage {s.coverage === null ? '—' : fmt.pct(s.coverage, 0)} · new open water {s.new_water_frac_vs_previous === null ? 'n/a (no prior pair)' : fmt.pct(s.new_water_frac_vs_previous, 2)}</li>
                      ))}</ul>
                    )}
                  </div>
                </div>
              </Panel>
              {cur.hourly.t_utc.length > 0 && (
                <Panel title="Hourly rainfall around the event (UTC)">
                  <EChart height={200} option={{
                    tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { fontSize: 11 } }, grid: { left: 40, right: 12, top: 28, bottom: 30 },
                    xAxis: { type: 'time', ...AXIS }, yAxis: { type: 'value', name: 'mm', ...AXIS },
                    series: [
                      { name: 'ERA5 hourly (max of 9 nodes)', type: 'bar', data: cur.hourly.t_utc.map((t, i) => [t + 'Z', cur.hourly.era5_mm[i]]), itemStyle: { color: '#3d6a8e' }, barMaxWidth: 6 },
                      ...(cur.hourly.imerg_t_utc ? [{ name: 'IMERG V06 (mm per 30 min, max cell)', type: 'line', showSymbol: false, data: cur.hourly.imerg_t_utc.map((t, i) => [t + 'Z', cur.hourly.imerg_mm_per_30min![i]]), lineStyle: { color: '#d9762b' } }] : []),
                    ],
                  }} />
                </Panel>
              )}
              <Panel title="Sources">
                <ul className="space-y-2 text-[12.5px]">
                  {cur.sources.map((s, i) => (
                    <li key={i} className="border-b border-paper-2 pb-2 last:border-0">
                      <div className="flex flex-wrap items-center gap-2"><Kind k="reported" /><span className="font-medium">{s.outlet}</span><span className="text-[11px] text-mute">{s.type}</span>{s.published_ist && <span className="num text-[11px] text-mute">published {s.published_ist.replace('T', ' ')} IST</span>}</div>
                      <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-[12px]">{s.url}</a>
                      {s.date_basis && <div className="text-[11.5px] text-slate">Date basis: {s.date_basis}</div>}
                      {s.summary && <div className="text-[11.5px] text-slate">{s.summary}</div>}
                      {s.cause && <div className="text-[11.5px] text-slate">{s.uei} · {s.cause}{s.fatalities ? ` · ${s.fatalities} fatalities reported` : ''}{s.damage ? ` · ${s.damage}` : ''}</div>}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[11.5px] text-mute">{cur.limitations}</div>
              </Panel>
            </div>
          )}
        </div>
      </Section>
      <Section><Callout>The event-day model uses the 24 documented days from 2016–2026. Many unreported waterlogging days certainly exist; they sit unlabelled among the negatives, which makes reported skill conservative.</Callout></Section>
    </div>
  )
}
