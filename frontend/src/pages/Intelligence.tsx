import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MLMap, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl'
import MapCanvas from '../components/MapCanvas'
import { Details, ErrorBox, Kind, LEVELS, Loading, Timestamp } from '../components/ui'
import { API_BASE, fmt, useApiStatus, useStatic } from '../lib/data'
import { LAYERS, SUS_COLORS, gridToGeoJSON, quantileStops, type LayerDef } from '../lib/layers'
import type { FloodEvent, GridData, LocalityFeature } from '../lib/types'

const CENTER: [number, number] = [88.3639, 22.5626]
const INPUTS = ['elev_mean', 'elev_min', 'hand_mean', 'twi_mean', 'depression_depth_mean', 'slope_mean', 'relelev_1km',
  'dist_waterway_m', 'dist_drain_canal_m', 'osm_waterbody_frac', 'perm_water_frac', 'sar_water_occurrence', 'sar_vv_mean_db',
  'lc_built_frac', 'lc_tree_frac', 'lc_crop_frac', 'road_density_km_km2']
const EXPOSURE = ['population', 'osm_building_count', 'facilities_health', 'facilities_education', 'facilities_emergency']

/** Layers shown up front, with everyday names. Everything else sits under "More map layers". */
const MAIN: Record<string, { label: string; help: string }> = {
  sus: { label: 'Waterlogging risk', help: 'Darker red means the spot is more likely to fill with water after heavy rain, compared with the rest of Kolkata.' },
  unc: { label: 'How sure we are', help: 'Darker brown means we are less sure about the risk shown for that spot. Light means we are fairly sure.' },
  pop: { label: 'Where people live', help: 'Darker means more people live in that square (an estimate, not a census count).' },
  built: { label: 'How built-up the area is', help: 'Darker means more of the ground is covered by buildings and pavement, so less rain can soak in.' },
}

/** Everyday wording for model inputs, used to explain why a spot scores high or low. */
const PLAIN: Record<string, string> = {
  road_density_km_km2: 'lots of roads and paved streets', lc_built_frac: 'how tightly packed the buildings are',
  lc_tree_frac: 'trees and green space', lc_grass_frac: 'open grass', lc_crop_frac: 'farmland', lc_water_frac: 'open water nearby',
  dist_drain_canal_m: 'how far it is from a canal or open drain', dist_waterway_m: 'how far it is from a river, canal or drain',
  dist_hooghly_m: 'how far it is from the Hooghly river', dist_perm_water_m: 'how far it is from lakes and ponds',
  elev_mean: 'the height of the ground and buildings', elev_min: 'the height of the lowest ground', elev_std: 'how much ground and building heights vary',
  slope_mean: 'how uneven the surface is (often tall buildings close together)', hand_mean: 'how high it sits above the nearest drain',
  hand_min: 'how high its lowest point sits above the nearest drain', twi_mean: 'how easily rainwater collects here',
  log_flowacc_max: 'how much rainwater flows here from nearby', depression_depth_mean: 'low hollows where water can pool',
  depression_frac_gt05m: 'low hollows where water can pool', relelev_1km: 'how low it is compared with the surrounding area',
  relelev_2km: 'how low it is compared with the wider neighbourhood', osm_waterbody_frac: 'ponds and water bodies',
  drain_canal_density_km_km2: 'the number of open drains and canals', jrc_occurrence_mean: 'how often satellites have seen water here',
  sar_water_occurrence: 'how often satellites see standing water here', sar_vv_mean_db: 'what the surface looks like to radar satellites',
  sar_vv_temporal_std_db: 'how much the surface changes in radar images',
}
const plain = (f: string) => (f.startsWith('missing_') ? 'some land-height data had to be estimated' : PLAIN[f] ?? f.replace(/_/g, ' '))

const ADVICE: Record<string, { you: string[]; local: string[] }> = {
  high: {
    you: [
      'During heavy rain, avoid walking or cycling through flooded streets. Electric shocks from wires and lamp posts under water have killed people in Kolkata.',
      'Do not drive into underpasses or water that reaches above your car\'s wheels.',
      'Keep important papers, medicines and electrical items off the floor. If water often enters your ground floor, consider raising plug points.',
      'Keep the drain or gully pit outside your home free of plastic and rubbish. Report blocked drains to the Kolkata Municipal Corporation.',
      'If someone in your home needs regular hospital visits, plan another route in advance. Several large hospitals sit in high-risk areas.',
      'Watch rain alerts from the India Meteorological Department. A lot of rain in a few hours is the main trigger.',
    ],
    local: ['Clear drains and gully pits before the monsoon and after storms.', 'Check that local pumps work before the rains arrive.', 'Mark the deepest spots and warn people about live wires during waterlogging.'],
  },
  medium: {
    you: [
      'Waterlogging happens here sometimes, mostly after very heavy rain. Take care on main roads and in dips and underpasses.',
      'Avoid walking through standing water, which can hide open drains and live wires.',
      'Keep drains near your home clear of plastic and rubbish, and report blockages to the municipality.',
    ],
    local: ['Include these streets in pre-monsoon drain cleaning.'],
  },
  low: {
    you: [
      'Waterlogging is less common here, but very heavy rain can still flood low spots and nearby main roads.',
      'Never walk through standing water, which can hide open drains and live wires.',
      'Keep drains clear and check rain alerts during the monsoon.',
    ],
    local: [],
  },
}

function colorExpr(L: LayerDef, g: GridData): ExpressionSpecification {
  const get: ExpressionSpecification = ['get', L.field]
  let inner: ExpressionSpecification
  if (L.kind === 'class') {
    inner = ['match', ['to-number', get, -1], 0, SUS_COLORS[0], 1, SUS_COLORS[1], 2, SUS_COLORS[2], 3, SUS_COLORS[3], 4, SUS_COLORS[4], 'rgba(0,0,0,0)']
  } else if (L.kind === 'flag') {
    inner = ['match', ['to-number', get, 0], 1, L.ramp[1], L.ramp[0]]
  } else {
    const stops = quantileStops(g.fields[L.field], L.ramp.length, L.log)
    const ramp = L.reverse ? [...L.ramp].reverse() : L.ramp
    const pairs: (number | string)[] = []
    stops.forEach((s, i) => pairs.push(i === 0 ? s : Math.max(s, (stops[i - 1] as number) + 1e-9), ramp[i]))
    inner = ['interpolate', ['linear'], ['to-number', get, 0], ...pairs] as unknown as ExpressionSpecification
  }
  return ['case', ['any', ['==', get, null], ['>=', ['coalesce', ['get', 'perm_water_frac'], 0], 0.5]], 'rgba(0,0,0,0)', inner]
}

function Legend({ L, g }: { L: LayerDef; g: GridData }) {
  if (L.kind === 'class')
    return (
      <div className="space-y-1">
        {LEVELS.map((l, i) => (
          <div key={l.key} className="flex items-center gap-2 text-[12.5px]"><span className="inline-block h-3 w-5" style={{ background: SUS_COLORS[i] }} />{l.label}</div>
        ))}
      </div>
    )
  if (L.kind === 'flag')
    return (
      <div className="space-y-1 text-[12px]">
        <div className="flex items-center gap-2"><span className="inline-block h-3 w-5" style={{ background: L.ramp[1] }} />{L.id === 'ext' ? 'Built-up area: the map is most reliable here' : 'Land-height data estimated'}</div>
        <div className="flex items-center gap-2"><span className="inline-block h-3 w-5" style={{ background: L.ramp[0] }} />{L.id === 'ext' ? 'Mostly open land: less reliable' : 'Land-height data measured'}</div>
      </div>
    )
  const s = quantileStops(g.fields[L.field], 2, L.log)
  const meta = g.field_meta[L.field]
  const lo = L.log ? Math.expm1(s[0]) : s[0]
  const hi = L.log ? Math.expm1(s[1]) : s[1]
  const ramp = L.reverse ? [...L.ramp].reverse() : L.ramp
  return (
    <div>
      <div className="h-2.5 w-full" style={{ background: `linear-gradient(90deg, ${ramp.join(',')})` }} />
      <div className="num mt-1 flex justify-between text-[11px] text-mute"><span>{L.id === 'unc' ? 'more sure' : fmt.n(lo, Math.abs(hi) < 10 ? 2 : 0)}</span><span>{L.id === 'unc' ? '' : meta?.unit}</span><span>{L.id === 'unc' ? 'less sure' : fmt.n(hi, Math.abs(hi) < 10 ? 2 : 0)}</span></div>
    </div>
  )
}

function cellCentre(g: GridData, id: number): [number, number] {
  const r = Math.floor(id / g.width)
  const c = id % g.width
  const cw = g.width + 1
  const idx = [r * cw + c, r * cw + c + 1, (r + 1) * cw + c, (r + 1) * cw + c + 1]
  return [idx.reduce((a, i) => a + g.corners.lon[i], 0) / 4, idx.reduce((a, i) => a + g.corners.lat[i], 0) / 4]
}

function nearestCell(g: GridData, lon: number, lat: number): number | null {
  let best: number | null = null
  let bd = Infinity
  for (let id = 0; id < g.width * g.height; id++) {
    const r = Math.floor(id / g.width)
    const c = id % g.width
    const k = r * (g.width + 1) + c
    const d = (g.corners.lon[k] - lon) ** 2 + (g.corners.lat[k] - lat) ** 2
    if (d < bd) { bd = d; best = id }
  }
  return bd < 1e-5 ? best : null
}

export default function Intelligence() {
  const grid = useStatic<GridData>('kolkata/grid.json')
  const locs = useStatic<{ features: LocalityFeature[] }>('kolkata/localities.geojson')
  const evs = useStatic<{ events: FloodEvent[] }>('kolkata/events.json')
  const models = useStatic<{ generated_utc: string; susceptibility: { selection: { xgb_tuned: { max_depth: number; n_estimators: number } } } }>('kolkata/models.json')
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [layerId, setLayerId] = useState('sus')
  const [opacity, setOpacity] = useState(0.72)
  const [showLocs, setShowLocs] = useState(true)
  const [sel, setSel] = useState<number | null>(null)
  const [eventDate, setEventDate] = useState<string>('')
  const [q, setQ] = useState('')
  const [searchMsg, setSearchMsg] = useState('')
  const layer = LAYERS.find((l) => l.id === layerId)!
  const gj = useMemo(() => (grid.data ? gridToGeoJSON(grid.data) : null), [grid.data])
  const datedEvents = useMemo(() => (evs.data?.events ?? []).filter((e) => e.n_localities > 0), [evs.data])

  const onReady = useCallback((m: MLMap) => {
    mapRef.current = m
    setReady(true)
  }, [])

  useEffect(() => {
    const m = mapRef.current
    if (!ready || !m || !gj || !grid.data || m.getSource('cells')) return
    m.addSource('cells', { type: 'geojson', data: gj, promoteId: 'id' })
    const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id
    m.addLayer({ id: 'cells-fill', type: 'fill', source: 'cells', paint: { 'fill-color': colorExpr(layer, grid.data), 'fill-opacity': opacity } }, firstSymbol)
    m.addLayer({ id: 'cells-sel', type: 'line', source: 'cells', paint: { 'line-color': '#0f1b2d', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.5, 0] } })
    m.addSource('locs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer({ id: 'locs-c', type: 'circle', source: 'locs', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.2, 14, 6],
      'circle-color': ['case', ['boolean', ['get', 'hl'], false], '#a8322d', '#0f1b2d'],
      'circle-stroke-color': ['case', ['boolean', ['get', 'hl'], false], '#ffffff', '#e0a24a'],
      'circle-stroke-width': 1.4, 'circle-opacity': 0.92 } })
    m.on('click', 'cells-fill', (e) => {
      const f = e.features?.[0]
      if (f) setSel(Number(f.id))
    })
    m.on('mouseenter', 'cells-fill', () => (m.getCanvas().style.cursor = 'pointer'))
    m.on('mouseleave', 'cells-fill', () => (m.getCanvas().style.cursor = ''))
    m.resize()
    m.fitBounds([[88.2, 22.4], [88.5, 22.7]], { padding: 20, duration: 0 })
  }, [ready, gj, grid.data, layer, opacity])

  useEffect(() => {
    const m = mapRef.current
    if (!m || !grid.data || !m.getLayer('cells-fill')) return
    m.setPaintProperty('cells-fill', 'fill-color', colorExpr(layer, grid.data))
  }, [layer, grid.data, ready])
  useEffect(() => {
    if (mapRef.current?.getLayer('cells-fill')) mapRef.current.setPaintProperty('cells-fill', 'fill-opacity', opacity)
  }, [opacity])
  const prevSel = useRef<number | null>(null)
  useEffect(() => {
    const m = mapRef.current
    if (!m || !m.getSource('cells')) return
    if (prevSel.current !== null) m.setFeatureState({ source: 'cells', id: prevSel.current }, { sel: false })
    if (sel !== null) m.setFeatureState({ source: 'cells', id: sel }, { sel: true })
    prevSel.current = sel
  }, [sel])
  useEffect(() => {
    const m = mapRef.current
    if (!m || !locs.data) return
    const src = m.getSource('locs') as GeoJSONSource | undefined
    if (!src) return
    const feats = showLocs ? locs.data.features.filter((f) => !eventDate || f.properties.events.includes(eventDate)).map((f) => ({ ...f, properties: { ...f.properties, hl: !!eventDate } })) : []
    src.setData({ type: 'FeatureCollection', features: feats } as GeoJSON.FeatureCollection)
  }, [locs.data, showLocs, eventDate, ready, gj])

  const search = async () => {
    const m = mapRef.current
    if (!q.trim() || !m || !grid.data) return
    const local = locs.data?.features.find((f) => f.properties.locality.toLowerCase().includes(q.trim().toLowerCase()))
    if (local) {
      m.flyTo({ center: local.geometry.coordinates, zoom: 14 })
      setSel(local.properties.cell_id)
      setSearchMsg(`Showing ${local.properties.locality}, a place reported under water in the news.`)
      return
    }
    try {
      setSearchMsg('Searching…')
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&bounded=1&viewbox=88.17,22.73,88.53,22.37&q=${encodeURIComponent(q)}`)
      const j = await r.json()
      if (!j.length) return setSearchMsg('We could not find that place inside the mapped area.')
      const lon = Number(j[0].lon)
      const lat = Number(j[0].lat)
      m.flyTo({ center: [lon, lat], zoom: 14 })
      setSel(nearestCell(grid.data, lon, lat))
      setSearchMsg(`Showing ${j[0].display_name.split(',').slice(0, 2).join(',')}.`)
    } catch {
      setSearchMsg('Search is not available right now.')
    }
  }

  if (grid.error) return <div className="p-6"><ErrorBox error={grid.error} hint="The map data could not be loaded. Please try again later." /></div>
  const g = grid.data
  const advanced = LAYERS.filter((l) => !MAIN[l.id])
  const groups = [...new Set(advanced.map((l) => l.group))]
  const selEvent = datedEvents.find((e) => e.date === eventDate)
  const layerLabel = MAIN[layer.id]?.label ?? layer.label

  return (
    <div className="flex flex-col lg:h-[calc(100vh-92px)] lg:min-h-[620px] lg:flex-row">
      <aside className="order-2 w-full shrink-0 border-r border-line bg-paper lg:order-1 lg:w-[310px] lg:overflow-y-auto">
        <div className="border-b border-line p-3">
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); search() }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a place, e.g. Behala" className="min-w-0 flex-1 border border-line bg-white px-2 py-2 text-[14px]" aria-label="Search for a place" />
            <button className="bg-ink px-3 text-[13px] text-paper">Go</button>
          </form>
          {searchMsg && <div className="mt-1 text-[12px] text-slate">{searchMsg}</div>}
        </div>
        <div className="border-b border-line p-3 text-[13.5px] leading-relaxed text-slate">
          <div className="mb-1 text-[14px] font-semibold text-ink">How to read this map</div>
          Each small square is about 250 metres across. <b>Darker red</b> squares are more likely to fill with water after heavy rain.
          <b> Black dots</b> are places that news reports said were under water. <b>Click any square</b> to find out what it means and what you can do.
        </div>
        <div className="border-b border-line p-3">
          <div className="mb-1.5 text-[14px] font-semibold text-ink">What to show</div>
          {Object.entries(MAIN).map(([id, m]) => (
            <label key={id} className={`flex cursor-pointer items-center gap-2 py-1 text-[14px] ${id === layerId ? 'font-semibold text-ink' : 'text-slate'}`}>
              <input type="radio" name="layer" checked={id === layerId} onChange={() => setLayerId(id)} className="accent-ink" />{m.label}
            </label>
          ))}
          <label className="mt-1 flex items-center gap-2 text-[14px] text-slate">
            <input type="checkbox" checked={showLocs} onChange={(e) => setShowLocs(e.target.checked)} /> Show places reported under water
          </label>
          <label className="mt-2 block text-[12px] text-mute">Colour strength <span className="num">{Math.round(opacity * 100)}%</span>
            <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full" />
          </label>
        </div>
        <div className="border-b border-line p-3">
          <div className="mb-1.5 text-[14px] font-semibold text-ink">Key: {layerLabel}</div>
          {g && <Legend L={layer} g={g} />}
          <p className="mt-2 text-[12.5px] leading-snug text-slate">{MAIN[layer.id]?.help ?? layer.help}</p>
        </div>
        <div className="border-b border-line p-3">
          <div className="mb-1 text-[14px] font-semibold text-ink">Past floods</div>
          <p className="mb-1.5 text-[12.5px] text-slate">Pick a day to see only the places reported under water that day.</p>
          <select value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full border border-line bg-white px-2 py-1.5 text-[13px]" aria-label="Past flood day">
            <option value="">All reported places</option>
            {datedEvents.map((e) => <option key={e.date} value={e.date}>{fmt.date(e.date)} ({e.n_localities} places)</option>)}
          </select>
          {datedEvents.length > 0 && (
            <input type="range" min={0} max={datedEvents.length} value={eventDate ? datedEvents.findIndex((e) => e.date === eventDate) + 1 : 0}
              onChange={(e) => { const i = Number(e.target.value); setEventDate(i === 0 ? '' : datedEvents[i - 1].date) }} className="mt-2 w-full" aria-label="Past flood timeline" />
          )}
          {selEvent && (
            <div className="mt-2 text-[12.5px] leading-snug text-slate">
              {selEvent.localities.slice(0, 8).join(', ')}{selEvent.localities.length > 8 ? ' and more' : ''}.
              {selEvent.rainfall.imd_max_cell_mm_day_D != null && <> Rain recorded: up to {fmt.n(Math.max(selEvent.rainfall.imd_max_cell_mm_day_D ?? 0, selEvent.rainfall.imd_max_cell_mm_day_D1 ?? 0), 0)} mm in a day.</>}
            </div>
          )}
        </div>
        <Details title="More map layers">
          <div className="p-3">
            <p className="mb-2 text-[12px] text-mute">Technical layers used to build the risk map.</p>
            {groups.map((gr) => (
              <div key={gr} className="mb-2">
                <div className="mb-0.5 text-[11px] font-semibold text-slate">{gr}</div>
                {advanced.filter((l) => l.group === gr).map((l) => (
                  <label key={l.id} className={`flex cursor-pointer items-center gap-2 py-0.5 text-[12.5px] ${l.id === layerId ? 'font-semibold text-ink' : 'text-slate'}`}>
                    <input type="radio" name="layer" checked={l.id === layerId} onChange={() => setLayerId(l.id)} className="accent-ink" />{l.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </Details>
      </aside>

      <div className="relative order-1 h-[60vh] shrink-0 lg:order-2 lg:h-auto lg:flex-1 lg:shrink">
        <MapCanvas center={CENTER} zoom={11} className="h-full w-full" onReady={onReady} />
        {(grid.loading || !gj) && <div className="absolute inset-0 flex items-center justify-center bg-paper/60"><Loading what="map" /></div>}
        {sel === null && gj && <div className="pointer-events-none absolute left-2 top-2 bg-white/95 px-3 py-1.5 text-[13px] text-ink shadow-sm">Click a square to learn about that spot</div>}
      </div>

      <aside className="order-3 w-full shrink-0 border-l border-line bg-white lg:w-[370px] lg:overflow-y-auto">
        {sel === null || !g ? (
          <div className="p-4 text-[14px] leading-relaxed text-slate">
            <div className="mb-1 text-[15px] font-semibold text-ink">Pick a spot</div>
            Click any coloured square on the map, or search for a place, to see how likely it is to waterlog and what you can do about it.
          </div>
        ) : (
          <CellPanel g={g} id={sel} locs={locs.data?.features ?? []} modelTs={models.data?.generated_utc} tuned={models.data?.susceptibility.selection.xgb_tuned} onClose={() => setSel(null)} />
        )}
      </aside>
    </div>
  )
}

function useLiveShap(id: number) {
  const api = useApiStatus()
  const [res, setRes] = useState<{ feature: string; shap: number }[] | null>(null)
  useEffect(() => {
    setRes(null)
    if (api !== 'online' || !API_BASE) return
    const ctl = new AbortController()
    fetch(`${API_BASE}/api/explainability?city=kolkata&cell_id=${id}&top=8`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j?.contributions && setRes(j.contributions)).catch(() => undefined)
    return () => ctl.abort()
  }, [api, id])
  return res
}

function usePlaceName(lon: number, lat: number) {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    setName(null)
    const ctl = new AbortController()
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const a = j?.address ?? {}
        const parts = [a.road, a.neighbourhood ?? a.suburb ?? a.quarter, a.city_district ?? a.city ?? a.town].filter(Boolean)
        if (parts.length) setName([...new Set(parts)].slice(0, 3).join(', '))
      })
      .catch(() => undefined)
    return () => ctl.abort()
  }, [lon, lat])
  return name
}

function CellPanel({ g, id, locs, modelTs, tuned, onClose }: { g: GridData; id: number; locs: LocalityFeature[]; modelTs?: string; tuned?: { max_depth: number; n_estimators: number }; onClose: () => void }) {
  const F = (k: string) => g.fields[k]?.[id] ?? null
  const live = useLiveShap(id)
  const [lon, lat] = cellCentre(g, id)
  const place = usePlaceName(lon, lat)
  const r = Math.floor(id / g.width)
  const c = id % g.width
  const sd = F('sus_sd') ?? 0
  const cls = F('sus_cls') ?? 0
  const pct = F('sus_pct') ?? 0
  const level = LEVELS[cls]
  const sure = sd < 6 ? 'fairly sure' : sd < 12 ? 'somewhat sure' : 'not very sure'
  const inCell = locs.filter((f) => f.properties.cell_id === id)
  const role = g.roles[F('role') ?? 0]
  const water = (F('perm_water_frac') ?? 0) >= 0.5
  const contribs = live ? live.map((x) => ({ f: x.feature, v: x.shap })) : g.shap_top3[id]
  const ups = contribs.filter((x) => x.v > 0).slice(0, 3)
  const downs = contribs.filter((x) => x.v < 0).slice(0, 3)
  const advice = ADVICE[cls >= 3 ? 'high' : cls === 2 ? 'medium' : 'low']
  const people = F('population') ?? 0
  const health = F('facilities_health') ?? 0
  const schools = F('facilities_education') ?? 0

  return (
    <div className="text-[14px]">
      <div className="flex items-start justify-between gap-2 border-b border-paper-2 p-4 pb-3">
        <div>
          <div className="text-[15px] font-semibold text-ink">{place ?? 'This spot'}</div>
          <div className="text-[12px] text-mute">Square about 250 m across, near {lat.toFixed(4)}° N, {lon.toFixed(4)}° E</div>
        </div>
        <button onClick={onClose} className="shrink-0 text-[12px] text-mute hover:text-ink" aria-label="Close">Close ✕</button>
      </div>

      {water ? (
        <div className="p-4 text-slate">This square is a river, lake or pond, so we do not give a waterlogging rating for it.</div>
      ) : (
        <>
          <div className="border-b border-paper-2 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-mute">Waterlogging risk</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="inline-block h-9 w-9 shrink-0 rounded-sm border border-line" style={{ background: level.color }} />
              <div className="h-serif text-[22px] font-semibold leading-tight">{level.label}</div>
            </div>
            <p className="mt-3 leading-relaxed text-slate">
              Compared with the rest of the mapped area, this spot is <b>more likely to fill with water after heavy rain than about {Math.round(pct)} out of every 100 places</b>.
              We are <b>{sure}</b> about this rating.
            </p>
            {F('urban') !== 1 && <p className="mt-2 leading-relaxed text-orange">This area is mostly open land, fields or water. The map was built from city streets, so it is less reliable here.</p>}
          </div>

          <div className="border-b border-paper-2 p-4">
            <div className="text-[15px] font-semibold text-ink">What this means</div>
            <p className="mt-1 leading-relaxed text-slate">
              {cls >= 3
                ? 'This spot looks a lot like places that have gone under water in past monsoons. On days with very heavy rain, expect water to collect on the streets here, sometimes knee-deep, usually draining within hours.'
                : cls === 2
                  ? 'Water can collect here after very heavy rain, but this spot is not among the worst in the city.'
                  : 'This spot is less like the places that usually go under water. Very heavy rain can still flood dips, underpasses and nearby main roads.'}
            </p>
            {(ups.length > 0 || downs.length > 0) && (
              <div className="mt-2 space-y-1 text-[13.5px] leading-relaxed text-slate">
                {ups.length > 0 && <p><b className="text-red">Makes it worse here:</b> {ups.map((x) => plain(x.f)).join('; ')}.</p>}
                {downs.length > 0 && <p><b className="text-blue">Helps here:</b> {downs.map((x) => plain(x.f)).join('; ')}.</p>}
                <p className="text-[12px] text-mute">These are patterns the map learned from past reports, not proven causes.</p>
              </div>
            )}
            {inCell.length > 0 && (
              <div className="mt-3 bg-[#fbf1ef] p-3 text-[13.5px] leading-relaxed text-[#6b2a24]">
                <b>News reports said this spot was under water:</b>{' '}
                {inCell.map((f) => `${f.properties.locality} (${f.properties.events.map(fmt.date).join(', ')})`).join('; ')}.
              </div>
            )}
            {people > 0 && (
              <p className="mt-2 text-[13.5px] text-slate">About <b>{fmt.n(Math.round(people / 10) * 10)}</b> people live in this square{health + schools > 0 ? <>, and it has <b>{health}</b> hospital or clinic{health === 1 ? '' : 's'} and <b>{schools}</b> school or college{schools === 1 ? '' : 's'} on the map</> : ''}.</p>
            )}
          </div>

          <div className="border-b border-paper-2 p-4">
            <div className="text-[15px] font-semibold text-ink">What you can do</div>
            <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate">
              {advice.you.map((a) => <li key={a}>{a}</li>)}
            </ul>
            {advice.local.length > 0 && (
              <>
                <div className="mt-3 text-[13.5px] font-semibold text-ink">For local offices and residents' associations</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-slate">{advice.local.map((a) => <li key={a}>{a}</li>)}</ul>
              </>
            )}
            <p className="mt-3 text-[12px] text-mute">General safety guidance, not an official advisory. Follow the India Meteorological Department and the Kolkata Municipal Corporation during storms.</p>
          </div>
        </>
      )}

      <Details title="How did we get this?">
        <TechnicalCell g={g} id={id} r={r} c={c} lon={lon} lat={lat} sd={sd} role={role} water={water} contribs={contribs} live={!!live} inCell={inCell} modelTs={modelTs} tuned={tuned} />
      </Details>
    </div>
  )
}

function TechnicalCell({ g, id, r, c, lon, lat, sd, role, water, contribs, live, inCell, modelTs, tuned }: {
  g: GridData; id: number; r: number; c: number; lon: number; lat: number; sd: number; role: string; water: boolean
  contribs: { f: string; v: number }[]; live: boolean; inCell: LocalityFeature[]; modelTs?: string; tuned?: { max_depth: number; n_estimators: number }
}) {
  const F = (k: string) => g.fields[k]?.[id] ?? null
  return (
    <div className="text-[12.5px]">
      <div className="border-b border-paper-2 p-4">
        <div className="eyebrow">Cell {id} · row {r}, col {c}</div>
        <div className="num mt-0.5 text-[12px] text-slate">{lat.toFixed(5)}° N, {lon.toFixed(5)}° E · 250 m UTM 45N grid</div>
      </div>
      {!water && (
        <div className="border-b border-paper-2 p-4">
          <div className="mb-1 flex items-center gap-2"><Kind k="model" /><span className="text-[11px] text-mute">Module A · static susceptibility</span></div>
          <div className="flex items-baseline gap-2">
            <span className="num text-2xl font-medium">{fmt.n(F('sus_pct'), 1)}</span><span className="text-[12px] text-mute">percentile (class: {g.classes[F('sus_cls') ?? 0]})</span>
          </div>
          <div className="mt-1 text-[11.5px] text-slate">90% ensemble interval <span className="num">{fmt.n(F('sus_p05'), 0)} to {fmt.n(F('sus_p95'), 0)}</span>; spread (SD of percentile) <span className="num">{fmt.n(sd, 1)}</span> points.</div>
          <div className="mt-1 text-[11px] text-mute">XGBoost (depth {tuned?.max_depth ?? 'n/a'}, {tuned?.n_estimators ?? 'n/a'} trees) trained on documented-locality positives vs urban background; 30-member block bootstrap for uncertainty. Scores are relative percentiles, not event probabilities. <Timestamp iso={modelTs} /></div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {F('urban') === 1 ? <span className="text-green">● inside urban modelling domain</span> : <span className="text-orange">● outside urban domain (extrapolation)</span>}
            {F('hand_imputed') === 1 && <span className="text-orange">● HAND imputed (KNN)</span>}
            {role === 'positive' && <span className="text-red">● training positive</span>}
          </div>
        </div>
      )}
      {!water && (
        <div className="border-b border-paper-2 p-4">
          <div className="eyebrow mb-1">Largest contributions (SHAP, log-odds){live ? ' · live from API' : ''}</div>
          {contribs.map((s) => (
            <div key={s.f} className="flex items-center gap-2 py-0.5">
              <span className="flex-1 truncate">{g.field_meta[s.f]?.label ?? s.f.replace(/_/g, ' ')}</span>
              <span className={`num ${s.v > 0 ? 'text-red' : 'text-blue'}`}>{s.v > 0 ? '+' : ''}{s.v.toFixed(2)}</span>
            </div>
          ))}
          <div className="mt-1 text-[10.5px] text-mute">Model attributions, not causal effects.</div>
        </div>
      )}
      <div className="border-b border-paper-2 p-4">
        <div className="eyebrow mb-1">Input variables</div>
        <table className="w-full"><tbody>
          {INPUTS.map((k) => {
            const m = g.field_meta[k]
            const v = F(k)
            const imputed = k === 'hand_mean' && F('hand_imputed') === 1
            return (
              <tr key={k} className="border-b border-paper-2 last:border-0">
                <td className="py-1 pr-2 text-slate">{m?.label}</td>
                <td className="num py-1 text-right">{v === null ? 'n/a' : fmt.n(v, Math.abs(v) < 10 ? 2 : 0)}</td>
                <td className="py-1 pl-1 text-[10.5px] text-mute">{m?.unit}</td>
                <td className="py-1 pl-1 text-right"><Kind k={imputed ? 'imputed' : m?.kind ?? 'derived'} /></td>
              </tr>
            )
          })}
        </tbody></table>
        <div className="mt-1 text-[10.5px] text-mute">HAND shown raw (blank where imputed); the model sees the KNN-imputed value plus a missingness flag.</div>
      </div>
      <div className="border-b border-paper-2 p-4">
        <div className="eyebrow mb-1">Potential exposure (not damage)</div>
        {EXPOSURE.map((k) => (
          <div key={k} className="flex justify-between py-0.5"><span className="text-slate">{g.field_meta[k]?.label}</span><span className="num">{fmt.n(F(k), 0)} <Kind k={g.field_meta[k]?.kind ?? 'observed'} /></span></div>
        ))}
      </div>
      <div className="p-4">
        <div className="eyebrow mb-1">Documented observations and sources</div>
        {inCell.length === 0 ? <div className="text-mute">None. Absence of a report is not evidence of no flooding.</div> : inCell.map((f) => (
          <div key={f.properties.locality} className="mb-2">
            <div className="font-semibold">{f.properties.locality} <Kind k="reported" /></div>
            <div className="text-[11px] text-mute">Geocoded ±{f.properties.uncertainty_m} m · {f.properties.osm_match.slice(0, 80)}</div>
            {f.properties.sources.map((s) => <a key={s} href={s} target="_blank" rel="noreferrer" className="block truncate text-[11px]">{s.replace(/^https?:\/\//, '')}</a>)}
          </div>
        ))}
      </div>
    </div>
  )
}
