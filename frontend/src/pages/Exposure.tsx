import { useCallback, useMemo, useState } from 'react'
import maplibregl, { type Map as MLMap } from 'maplibre-gl'
import EChart, { AXIS } from '../components/EChart'
import MapCanvas from '../components/MapCanvas'
import { Callout, ErrorBox, Kind, Loading, PageHeader, Panel, Section, Timestamp } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import { SUS_COLORS } from '../lib/layers'

type Row = { class: string; cells: number; area_km2: number; population: number; osm_buildings: number; road_km: number; health_facilities: number; education_facilities: number; emergency_facilities: number; urban_domain_cells: number }
type Fac = { name: string | null; type: string; lon: number; lat: number; cell_id: number; sus_class: string | null; sus_pct: number | null }
const CLASSES = ['very low', 'low', 'moderate', 'high', 'very high']

export default function Exposure() {
  const ex = useStatic<{ generated_utc: string; by_class: Row[]; facilities: Fac[]; definition: string; sources: Record<string, string> }>('kolkata/exposure.json')
  const [metric, setMetric] = useState<keyof Row>('population')
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const facs = useMemo(() => (ex.data?.facilities ?? []).filter((f) => (type === 'all' || f.type === type) && (!q || (f.name ?? '').toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (b.sus_pct ?? 0) - (a.sus_pct ?? 0)), [ex.data, type, q])

  const onReady = useCallback((m: MLMap) => {
    const data = ex.data
    if (!data) return
    m.addSource('fac', { type: 'geojson', data: { type: 'FeatureCollection', features: data.facilities.map((f) => ({ type: 'Feature', properties: { ...f, ci: f.sus_class ? CLASSES.indexOf(f.sus_class) : -1 }, geometry: { type: 'Point', coordinates: [f.lon, f.lat] } })) } as GeoJSON.FeatureCollection })
    m.addLayer({ id: 'fac', type: 'circle', source: 'fac', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 6],
      'circle-color': ['match', ['get', 'ci'], 0, SUS_COLORS[0], 1, SUS_COLORS[1], 2, SUS_COLORS[2], 3, SUS_COLORS[3], 4, SUS_COLORS[4], '#999'],
      'circle-stroke-color': '#0f1b2d', 'circle-stroke-width': 0.6 } })
    m.on('click', 'fac', (e) => {
      const p = e.features?.[0]?.properties as unknown as Fac
      if (p) new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${p.name ?? '(unnamed)'}</b><br/>${p.type} · susceptibility ${p.sus_class} (${p.sus_pct} pct)`).addTo(m)
    })
    m.fitBounds([[88.2, 22.4], [88.5, 22.7]], { padding: 10, duration: 0 })
  }, [ex.data])

  if (ex.error) return <ErrorBox error={ex.error} />
  const rows = ex.data?.by_class ?? []
  const total = rows.reduce((s, r) => s + (r[metric] as number), 0)
  return (
    <div>
      <PageHeader eyebrow="Module E" title="Potential exposure">
        How much population, building stock, road network and critical infrastructure lies in cells of each relative susceptibility class.
        <b> This is potential exposure, not observed damage or affected population.</b>
      </PageHeader>
      <Section>
        {!ex.data ? <Loading /> : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Panel title="Exposure by susceptibility class" note={<Timestamp iso={ex.data.generated_utc} />}>
              <div className="mb-2 flex flex-wrap gap-1 text-[11.5px]">
                {([['population', 'Population'], ['osm_buildings', 'Buildings (OSM)'], ['road_km', 'Road km'], ['health_facilities', 'Health'], ['education_facilities', 'Education'], ['area_km2', 'Area km²']] as [keyof Row, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setMetric(k)} className={`border px-2 py-0.5 ${metric === k ? 'border-ink bg-ink text-paper' : 'border-line text-slate'}`}>{l}</button>
                ))}
              </div>
              <EChart height={240} option={{
                tooltip: { trigger: 'axis' }, grid: { left: 70, right: 16, top: 10, bottom: 30 },
                xAxis: { type: 'category', data: rows.map((r) => r.class), ...AXIS }, yAxis: { type: 'value', ...AXIS },
                series: [{ type: 'bar', data: rows.map((r, i) => ({ value: r[metric], itemStyle: { color: SUS_COLORS[i], borderColor: '#0f1b2d', borderWidth: 0.5 } })) }],
              }} />
              <table className="data mt-2">
                <thead><tr><th>Class</th><th className="text-right">Area km²</th><th className="text-right">Population <Kind k="modelled" /></th><th className="text-right">Buildings</th><th className="text-right">Road km</th><th className="text-right">Health</th><th className="text-right">Educ.</th><th className="text-right">Emerg.</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.class}><td>{r.class}</td><td className="num text-right">{fmt.n(r.area_km2, 1)}</td><td className="num text-right">{fmt.n(r.population)}</td><td className="num text-right">{fmt.n(r.osm_buildings)}</td><td className="num text-right">{fmt.n(r.road_km, 0)}</td><td className="num text-right">{r.health_facilities}</td><td className="num text-right">{r.education_facilities}</td><td className="num text-right">{r.emergency_facilities}</td></tr>
                ))}</tbody>
              </table>
              <p className="mt-2 text-[11.5px] text-mute">Share of selected metric in the two highest classes: <b className="num">{total ? fmt.pct(rows.filter((r) => r.class === 'high' || r.class === 'very high').reduce((s, r) => s + (r[metric] as number), 0) / total) : '—'}</b>. Classes are percentile bands (top 10% / top 3% of cells), so high classes cover small areas by construction.</p>
            </Panel>
            <Panel title="Critical facilities coloured by cell susceptibility">
              <div className="h-[360px] border border-line"><MapCanvas center={[88.36, 22.56]} zoom={10.5} className="h-full w-full" onReady={onReady} /></div>
            </Panel>
          </div>
        )}
      </Section>
      <Section title="Facilities ranked by cell susceptibility">
        <div className="mb-2 flex flex-wrap gap-2 text-[12px]">
          <select value={type} onChange={(e) => setType(e.target.value)} className="border border-line bg-white px-2 py-1">
            <option value="all">All types</option>{[...new Set((ex.data?.facilities ?? []).map((f) => f.type))].filter(Boolean).map((t) => <option key={t}>{t}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="border border-line px-2 py-1" />
          <span className="self-center text-mute">{facs.length} facilities (OSM)</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto border border-line bg-white">
          <table className="data"><thead><tr><th>Name</th><th>Type</th><th>Class</th><th className="text-right">Percentile</th><th className="text-right">Lat, Lon</th></tr></thead>
            <tbody>{facs.slice(0, 300).map((f, i) => (
              <tr key={i}><td>{f.name ?? <span className="text-mute">(unnamed)</span>}</td><td>{f.type}</td><td><span className="inline-block h-2.5 w-2.5 align-middle" style={{ background: f.sus_class ? SUS_COLORS[CLASSES.indexOf(f.sus_class)] : '#ccc' }} /> {f.sus_class}</td><td className="num text-right">{fmt.n(f.sus_pct, 0)}</td><td className="num text-right text-[11px]">{f.lat.toFixed(4)}, {f.lon.toFixed(4)}</td></tr>
            ))}</tbody></table>
        </div>
        <div className="mt-3"><Callout>{ex.data?.definition} Population: {ex.data?.sources.population}. Facilities and buildings: {ex.data?.sources.buildings_roads_facilities}; OSM completeness varies, so counts are lower bounds.</Callout></div>
      </Section>
    </div>
  )
}
