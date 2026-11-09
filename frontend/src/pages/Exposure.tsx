import { useCallback, useMemo, useState } from 'react'
import maplibregl, { type Map as MLMap } from 'maplibre-gl'
import EChart, { AXIS } from '../components/EChart'
import MapCanvas from '../components/MapCanvas'
import { Callout, ErrorBox, Kind, LEVELS, Loading, PageHeader, Panel, Plain, Section, TechDetails, Timestamp } from '../components/ui'
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
      if (p) new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${p.name ?? '(no name on map)'}</b><br/>${TYPE[p.type] ?? p.type}<br/>Waterlogging risk here: ${p.sus_class ? LEVELS[CLASSES.indexOf(p.sus_class)].label : 'not rated'}`).addTo(m)
    })
    m.fitBounds([[88.2, 22.4], [88.5, 22.7]], { padding: 10, duration: 0 })
  }, [ex.data])

  if (ex.error) return <ErrorBox error={ex.error} />
  const rows = ex.data?.by_class ?? []
  const total = rows.reduce((s, r) => s + (r[metric] as number), 0)
  const top = rows.filter((r) => r.class === 'high' || r.class === 'very high')
  const sum = (k: keyof Row, rs: Row[]) => rs.reduce((a, r) => a + (r[k] as number), 0)
  const lakh = (n: number) => `${(n / 1e5).toFixed(1)} lakh`
  return (
    <div>
      <PageHeader eyebrow="Exposure" title="Who lives and works where streets flood most?">
        How many people, hospitals, schools and emergency services are in the parts of Kolkata most likely to waterlog. This shows who
        could be affected, not who was actually harmed in any flood.
      </PageHeader>
      <Section>
        {!ex.data ? <Loading /> : (
          <Plain title="In the highest-risk areas">
            <p>The two highest-risk groups on the map ("Often waterlogs" and "Among the worst spots") cover only about
              <b> {Math.round((100 * sum('area_km2', top)) / sum('area_km2', rows))}%</b> of the mapped area, but they contain:</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="border-l-4 border-red pl-3"><div className="num text-2xl">{lakh(sum('population', top))}</div><div className="text-[14px] text-slate">people (about {Math.round((100 * sum('population', top)) / sum('population', rows))}% of everyone in the area, an estimate)</div></div>
              <div className="border-l-4 border-red pl-3"><div className="num text-2xl">{sum('health_facilities', top)}</div><div className="text-[14px] text-slate">hospitals and clinics ({Math.round((100 * sum('health_facilities', top)) / sum('health_facilities', rows))}% of those on the map)</div></div>
              <div className="border-l-4 border-red pl-3"><div className="num text-2xl">{sum('education_facilities', top)}</div><div className="text-[14px] text-slate">schools and colleges ({Math.round((100 * sum('education_facilities', top)) / sum('education_facilities', rows))}% of those on the map)</div></div>
            </div>
            <p className="mt-4 text-[14.5px] leading-relaxed text-slate">
              The busiest, most crowded parts of the city are also the parts that flood most often. During heavy rain, getting to hospitals in
              these areas can be hard. In September 2025, patients waded through knee-deep water at several major government hospitals.
            </p>
          </Plain>
        )}
      </Section>
      <Section title="Hospitals, schools and emergency services on the risk map">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="h-[420px] border border-line bg-white">{ex.data && <MapCanvas center={[88.36, 22.56]} zoom={10.5} className="h-full w-full" onReady={onReady} />}</div>
          <div>
            <div className="mb-2 text-[14px] font-semibold">Dot colour = waterlogging risk where the building stands</div>
            {LEVELS.map((l) => <div key={l.key} className="flex items-center gap-2 py-0.5 text-[13.5px]"><span className="inline-block h-3 w-3 rounded-full border border-ink" style={{ background: l.color }} />{l.label}</div>)}
            <p className="mt-2 text-[13px] text-slate">Click a dot to see its name. Only places marked on OpenStreetMap appear, so some are missing.</p>
            <div className="mt-4 text-[14px] font-semibold">Find a place</div>
            <div className="mt-1 flex flex-wrap gap-2 text-[13px]">
              <select value={type} onChange={(e) => setType(e.target.value)} className="border border-line bg-white px-2 py-1">
                <option value="all">All types</option>{[...new Set((ex.data?.facilities ?? []).map((f) => f.type))].filter(Boolean).map((t) => <option key={t} value={t}>{TYPE[t] ?? t}</option>)}
              </select>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, e.g. SSKM" className="min-w-0 flex-1 border border-line px-2 py-1" />
            </div>
            <div className="mt-2 max-h-[240px] overflow-y-auto border border-line bg-white">
              <table className="data"><tbody>{facs.slice(0, 200).map((f, i) => {
                const lv = f.sus_class ? LEVELS[CLASSES.indexOf(f.sus_class)] : null
                return <tr key={i}><td>{f.name ?? <span className="text-mute">(no name on map)</span>}<div className="text-[11.5px] text-mute">{TYPE[f.type] ?? f.type}</div></td><td className="text-[12.5px]"><span className="mr-1 inline-block h-2.5 w-2.5" style={{ background: lv?.color ?? '#ccc' }} />{lv?.label ?? 'n/a'}</td></tr>
              })}</tbody></table>
            </div>
          </div>
        </div>
      </Section>
      <TechDetails>
        <Section>
            <Panel title="Exposure by susceptibility class" note={<Timestamp iso={ex.data?.generated_utc} />}>
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
              <p className="mt-2 text-[11.5px] text-mute">Share of selected metric in the two highest classes: <b className="num">{total ? fmt.pct(rows.filter((r) => r.class === 'high' || r.class === 'very high').reduce((s, r) => s + (r[metric] as number), 0) / total) : 'n/a'}</b>. Classes are percentile bands (top 10% / top 3% of cells), so high classes cover small areas by construction.</p>
            </Panel>
        </Section>
        <Section title="All facilities with model percentiles">
        <div className="max-h-[420px] overflow-y-auto border border-line bg-white">
          <table className="data"><thead><tr><th>Name</th><th>Type</th><th>Class</th><th className="text-right">Percentile</th><th className="text-right">Lat, Lon</th></tr></thead>
            <tbody>{facs.slice(0, 300).map((f, i) => (
              <tr key={i}><td>{f.name ?? <span className="text-mute">(unnamed)</span>}</td><td>{f.type}</td><td><span className="inline-block h-2.5 w-2.5 align-middle" style={{ background: f.sus_class ? SUS_COLORS[CLASSES.indexOf(f.sus_class)] : '#ccc' }} /> {f.sus_class}</td><td className="num text-right">{fmt.n(f.sus_pct, 0)}</td><td className="num text-right text-[11px]">{f.lat.toFixed(4)}, {f.lon.toFixed(4)}</td></tr>
            ))}</tbody></table>
        </div>
        <div className="mt-3"><Callout>{ex.data?.definition} Population: {ex.data?.sources.population}. Facilities and buildings: {ex.data?.sources.buildings_roads_facilities}; OSM completeness varies, so counts are lower bounds.</Callout></div>
        </Section>
      </TechDetails>
    </div>
  )
}

const TYPE: Record<string, string> = { hospital: 'Hospital', clinic: 'Clinic', school: 'School', college: 'College', university: 'University', fire_station: 'Fire station', police: 'Police station', ambulance_station: 'Ambulance station' }
