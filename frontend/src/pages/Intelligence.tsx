import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MLMap, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl'
import MapCanvas from '../components/MapCanvas'
import { ErrorBox, Kind, Loading, Timestamp } from '../components/ui'
import { API_BASE, fmt, useApiStatus, useStatic } from '../lib/data'
import { LAYERS, SUS_COLORS, gridToGeoJSON, quantileStops, type LayerDef } from '../lib/layers'
import type { FloodEvent, GridData, LocalityFeature } from '../lib/types'

const CENTER: [number, number] = [88.3639, 22.5626]
const INPUTS = ['elev_mean', 'elev_min', 'hand_mean', 'twi_mean', 'depression_depth_mean', 'slope_mean', 'relelev_1km',
  'dist_waterway_m', 'dist_drain_canal_m', 'osm_waterbody_frac', 'perm_water_frac', 'sar_water_occurrence', 'sar_vv_mean_db',
  'lc_built_frac', 'lc_tree_frac', 'lc_crop_frac', 'road_density_km_km2']
const EXPOSURE = ['population', 'osm_building_count', 'facilities_health', 'facilities_education', 'facilities_emergency']

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
        {g.classes.map((c, i) => (
          <div key={c} className="flex items-center gap-2 text-[11.5px]"><span className="inline-block h-3 w-5" style={{ background: SUS_COLORS[i] }} />{c}<span className="num ml-auto text-mute">{['0–50', '50–75', '75–90', '90–97', '97–100'][i]} pct</span></div>
        ))}
      </div>
    )
  if (L.kind === 'flag')
    return (
      <div className="space-y-1 text-[11.5px]">
        <div className="flex items-center gap-2"><span className="inline-block h-3 w-5" style={{ background: L.ramp[1] }} />{L.id === 'ext' ? 'Inside urban modelling domain' : 'HAND imputed'}</div>
        <div className="flex items-center gap-2"><span className="inline-block h-3 w-5" style={{ background: L.ramp[0] }} />{L.id === 'ext' ? 'Outside — extrapolation' : 'Routed (observed DSM)'}</div>
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
      <div className="num mt-1 flex justify-between text-[10.5px] text-mute"><span>{fmt.n(lo, Math.abs(hi) < 10 ? 2 : 0)}</span><span>{meta?.unit}</span><span>{fmt.n(hi, Math.abs(hi) < 10 ? 2 : 0)}</span></div>
      <div className="text-[10.5px] text-mute">2nd–98th percentile stretch{L.log ? ' (log scale)' : ''}</div>
    </div>
  )
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

  // add sources/layers once data + map ready
  useEffect(() => {
    const m = mapRef.current
    if (!ready || !m || !gj || !grid.data || m.getSource('cells')) return
    m.addSource('cells', { type: 'geojson', data: gj, promoteId: 'id' })
    const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id
    m.addLayer({ id: 'cells-fill', type: 'fill', source: 'cells', paint: { 'fill-color': colorExpr(layer, grid.data), 'fill-opacity': opacity } }, firstSymbol)
    m.addLayer({ id: 'cells-sel', type: 'line', source: 'cells', paint: { 'line-color': '#0f1b2d', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.2, 0] } })
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
    m.on('mouseenter', 'cells-fill', () => (m.getCanvas().style.cursor = 'crosshair'))
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
    if (!q.trim() || !m) return
    const local = locs.data?.features.find((f) => f.properties.locality.toLowerCase().includes(q.trim().toLowerCase()))
    if (local) {
      m.flyTo({ center: local.geometry.coordinates, zoom: 14 })
      setSel(local.properties.cell_id)
      setSearchMsg(`Documented locality: ${local.properties.locality}`)
      return
    }
    try {
      setSearchMsg('Searching OpenStreetMap…')
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&bounded=1&viewbox=88.17,22.73,88.53,22.37&q=${encodeURIComponent(q)}`)
      const j = await r.json()
      if (!j.length) return setSearchMsg('No match inside the study area.')
      m.flyTo({ center: [Number(j[0].lon), Number(j[0].lat)], zoom: 14 })
      setSearchMsg(j[0].display_name.split(',').slice(0, 3).join(','))
    } catch {
      setSearchMsg('Search service unavailable.')
    }
  }

  if (grid.error) return <div className="p-6"><ErrorBox error={grid.error} hint="The static data bundle could not be loaded. Rebuild it with `python -m flood_intelligence.inference.export`." /></div>
  const g = grid.data
  const groups = [...new Set(LAYERS.map((l) => l.group))]
  const selEvent = datedEvents.find((e) => e.date === eventDate)

  return (
    <div className="flex flex-col lg:h-[calc(100vh-92px)] lg:min-h-[620px] lg:flex-row">
      {/* controls */}
      <aside className="order-2 w-full shrink-0 border-r border-line bg-paper lg:order-1 lg:w-[300px] lg:overflow-y-auto">
        <div className="border-b border-line p-3">
          <div className="eyebrow">Kolkata · 250 m grid</div>
          <form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); search() }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search locality or place" className="min-w-0 flex-1 border border-line bg-white px-2 py-1.5 text-[13px]" aria-label="Geographic search" />
            <button className="bg-ink px-2.5 text-[12px] text-paper">Go</button>
          </form>
          {searchMsg && <div className="mt-1 text-[11px] text-mute">{searchMsg}</div>}
        </div>
        <div className="border-b border-line p-3">
          <div className="eyebrow mb-2">Layers</div>
          {groups.map((gr) => (
            <div key={gr} className="mb-2">
              <div className="mb-0.5 text-[11px] font-semibold text-slate">{gr}</div>
              {LAYERS.filter((l) => l.group === gr).map((l) => (
                <label key={l.id} className={`flex cursor-pointer items-center gap-2 py-0.5 text-[12.5px] ${l.id === layerId ? 'font-semibold text-ink' : 'text-slate'}`}>
                  <input type="radio" name="layer" checked={l.id === layerId} onChange={() => setLayerId(l.id)} className="accent-ink" />
                  {l.label}
                </label>
              ))}
            </div>
          ))}
          <label className="mt-2 block text-[11px] text-mute">Opacity <span className="num">{Math.round(opacity * 100)}%</span>
            <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full" />
          </label>
          <label className="mt-1 flex items-center gap-2 text-[12.5px] text-slate">
            <input type="checkbox" checked={showLocs} onChange={(e) => setShowLocs(e.target.checked)} /> Documented waterlogging localities
          </label>
        </div>
        <div className="border-b border-line p-3">
          <div className="eyebrow mb-2">Legend · {layer.label}</div>
          {g && <Legend L={layer} g={g} />}
          <p className="mt-2 text-[11.5px] leading-snug text-mute">{layer.help}</p>
        </div>
        <div className="p-3">
          <div className="eyebrow mb-1">Timeline · documented events</div>
          <select value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full border border-line bg-white px-2 py-1.5 text-[12.5px]" aria-label="Event date">
            <option value="">All documented localities</option>
            {datedEvents.map((e) => <option key={e.date} value={e.date}>{fmt.date(e.date)} · {e.n_localities} localities</option>)}
          </select>
          {datedEvents.length > 0 && (
            <input type="range" min={0} max={datedEvents.length} value={eventDate ? datedEvents.findIndex((e) => e.date === eventDate) + 1 : 0}
              onChange={(e) => { const i = Number(e.target.value); setEventDate(i === 0 ? '' : datedEvents[i - 1].date) }} className="mt-2 w-full" aria-label="Timeline slider" />
          )}
          {selEvent && (
            <div className="mt-2 text-[11.5px] leading-snug text-slate">
              <Kind k="reported" /> {selEvent.localities.slice(0, 8).join(', ')}{selEvent.localities.length > 8 ? '…' : ''}
              <div className="num mt-1 text-mute">IMD max cell: {fmt.n(selEvent.rainfall.imd_max_cell_mm_day_D, 0)} / {fmt.n(selEvent.rainfall.imd_max_cell_mm_day_D1, 0)} mm (day D / D+1) · ERA5 48 h: {fmt.n(selEvent.rainfall.era5_48h_mm, 0)} mm</div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-mute">Dynamic, rainfall-conditioned estimates are city-scale (see Forecasting). The susceptibility surface is static.</p>
        </div>
      </aside>

      {/* map */}
      <div className="relative order-1 h-[60vh] shrink-0 lg:order-2 lg:h-auto lg:flex-1 lg:shrink">
        <MapCanvas center={CENTER} zoom={11} className="h-full w-full" onReady={onReady} />
        {(grid.loading || !gj) && <div className="absolute inset-0 flex items-center justify-center bg-paper/60"><Loading what="250 m grid" /></div>}
        <div className="pointer-events-none absolute left-2 top-2 bg-white/90 px-2 py-1 text-[11px] text-slate">
          <Kind k="model" /> relative susceptibility · <Timestamp iso={g?.generated_utc} />
        </div>
      </div>

      {/* info panel */}
      <aside className="order-3 w-full shrink-0 border-l border-line bg-white lg:w-[340px] lg:overflow-y-auto">
        {sel === null || !g ? (
          <div className="p-4 text-[13px] leading-relaxed text-slate">
            <div className="eyebrow mb-1">Location details</div>
            Click any cell to inspect the model output, its uncertainty, the input variables and the documented observations in that cell.
            <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px] text-mute">
              {g?.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
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

function CellPanel({ g, id, locs, modelTs, tuned, onClose }: { g: GridData; id: number; locs: LocalityFeature[]; modelTs?: string; tuned?: { max_depth: number; n_estimators: number }; onClose: () => void }) {
  const F = (k: string) => g.fields[k]?.[id] ?? null
  const live = useLiveShap(id)
  const r = Math.floor(id / g.width)
  const c = id % g.width
  const cw = g.width + 1
  const idx = [r * cw + c, r * cw + c + 1, (r + 1) * cw + c, (r + 1) * cw + c + 1]
  const lon = idx.reduce((a, i) => a + g.corners.lon[i], 0) / 4
  const lat = idx.reduce((a, i) => a + g.corners.lat[i], 0) / 4
  const sd = F('sus_sd') ?? 0
  const conf = sd < 6 ? 'higher' : sd < 12 ? 'moderate' : 'lower'
  const inCell = locs.filter((f) => f.properties.cell_id === id)
  const role = g.roles[F('role') ?? 0]
  const water = (F('perm_water_frac') ?? 0) >= 0.5
  return (
    <div className="text-[12.5px]">
      <div className="flex items-start justify-between border-b border-paper-2 p-4 pb-3">
        <div>
          <div className="eyebrow">Cell {id} · row {r}, col {c}</div>
          <div className="num mt-0.5 text-[12px] text-slate">{lat.toFixed(5)}° N, {lon.toFixed(5)}° E</div>
        </div>
        <button onClick={onClose} className="text-[11px] text-mute hover:text-ink" aria-label="Close">Close ✕</button>
      </div>
      <div className="border-b border-paper-2 p-4">
        <div className="mb-1 flex items-center gap-2"><Kind k="model" /><span className="text-[11px] text-mute">Module A · static susceptibility</span></div>
        {water ? <div className="text-slate">Permanent water — not assessed.</div> : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="num text-3xl font-medium">{fmt.n(F('sus_pct'), 0)}</span>
              <span className="text-[12px] text-mute">percentile</span>
              <span className="ml-auto rounded-sm px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: SUS_COLORS[F('sus_cls') ?? 0] }}>{g.classes[F('sus_cls') ?? 0]}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-slate">90% ensemble interval <span className="num">{fmt.n(F('sus_p05'), 0)}–{fmt.n(F('sus_p95'), 0)}</span> · spread <span className="num">{fmt.n(sd, 1)}</span> pts → <b>{conf} confidence</b></div>
            <div className="mt-1 text-[11px] text-mute">XGBoost (depth {tuned?.max_depth ?? '–'}, {tuned?.n_estimators ?? '–'} trees), 30-member block bootstrap. <Timestamp iso={modelTs} /></div>
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {F('urban') === 1 ? <span className="text-[11px] text-green">● inside urban modelling domain</span> : <span className="text-[11px] text-orange">● outside urban domain — extrapolation</span>}
          {F('hand_imputed') === 1 && <span className="text-[11px] text-orange">● HAND imputed (KNN)</span>}
          {role === 'positive' && <span className="text-[11px] text-red">● training positive</span>}
        </div>
      </div>
      {!water && (
        <div className="border-b border-paper-2 p-4">
          <div className="eyebrow mb-1">Largest contributions (SHAP, log-odds){live ? ' · live from API' : ''}</div>
          {(live ? live.map((c) => ({ f: c.feature, v: c.shap })) : g.shap_top3[id]).map((s) => (
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
        <table className="w-full">
          <tbody>
            {INPUTS.map((k) => {
              const m = g.field_meta[k]
              const v = F(k)
              const imputed = k === 'hand_mean' && F('hand_imputed') === 1
              return (
                <tr key={k} className="border-b border-paper-2 last:border-0">
                  <td className="py-1 pr-2 text-slate">{m?.label}</td>
                  <td className="num py-1 text-right">{v === null ? '—' : fmt.n(v, Math.abs(v) < 10 ? 2 : 0)}</td>
                  <td className="py-1 pl-1 text-[10.5px] text-mute">{m?.unit}</td>
                  <td className="py-1 pl-1 text-right"><Kind k={imputed ? 'imputed' : m?.kind ?? 'derived'} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-1 text-[10.5px] text-mute">HAND shown raw (blank where imputed); the model sees the KNN-imputed value plus a missingness flag.</div>
      </div>
      <div className="border-b border-paper-2 p-4">
        <div className="eyebrow mb-1">Potential exposure (not damage)</div>
        {EXPOSURE.map((k) => (
          <div key={k} className="flex justify-between py-0.5"><span className="text-slate">{g.field_meta[k]?.label}</span><span className="num">{fmt.n(F(k), 0)} <Kind k={g.field_meta[k]?.kind ?? 'observed'} /></span></div>
        ))}
      </div>
      <div className="p-4">
        <div className="eyebrow mb-1">Documented observations in this cell</div>
        {inCell.length === 0 ? <div className="text-mute">None. Absence of a report is not evidence of no flooding.</div> : inCell.map((f) => (
          <div key={f.properties.locality} className="mb-2">
            <div className="font-semibold">{f.properties.locality} <Kind k="reported" /></div>
            <div className="text-[11px] text-mute">Geocoded ±{f.properties.uncertainty_m} m · {f.properties.osm_match.slice(0, 80)}</div>
            <div className="num text-[11px]">{f.properties.events.map(fmt.date).join(' · ')}</div>
            {f.properties.sources.map((s) => <a key={s} href={s} target="_blank" rel="noreferrer" className="block truncate text-[11px]">{s.replace(/^https?:\/\//, '')}</a>)}
          </div>
        ))}
      </div>
    </div>
  )
}
