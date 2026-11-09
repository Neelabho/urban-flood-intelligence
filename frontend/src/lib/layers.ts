/** Map layer catalogue and colour ramps (data-driven styling of the 250 m grid). */
import type { GridData } from './types'

export const SUS_COLORS = ['#efe9dc', '#f0d39a', '#e7a35b', '#cf6537', '#a12f2a']
export const SEQ = ['#f4f1ea', '#d9e3ea', '#a9c1d3', '#6f95b3', '#3d6a8e', '#1f3e5c']
export const SEQ_WARM = ['#f6f1e7', '#f1dcb1', '#e8b977', '#d98d4a', '#bf5f2f', '#8f3a23']
export const UNC = ['#f4f1ea', '#e3dccd', '#c9bba3', '#a8937a', '#7e6a55', '#55473a']

export type LayerDef = {
  id: string
  field: string
  label: string
  group: 'Model outputs' | 'Terrain' | 'Hydrology' | 'Urban fabric' | 'Exposure' | 'Coverage'
  ramp: string[]
  kind: 'class' | 'continuous' | 'flag'
  reverse?: boolean
  log?: boolean
  help: string
}

export const LAYERS: LayerDef[] = [
  { id: 'sus', field: 'sus_cls', label: 'Waterlogging susceptibility', group: 'Model outputs', ramp: SUS_COLORS, kind: 'class',
    help: 'Relative susceptibility class from the XGBoost model trained on documented waterlogging localities. Relative within the study area; not an event probability.' },
  { id: 'sus_pct', field: 'sus_pct', label: 'Susceptibility percentile', group: 'Model outputs', ramp: SUS_COLORS, kind: 'continuous',
    help: 'Percentile rank of the model score (0–100).' },
  { id: 'unc', field: 'sus_sd', label: 'Uncertainty (ensemble spread)', group: 'Model outputs', ramp: UNC, kind: 'continuous',
    help: 'Standard deviation of the percentile across 30 block-bootstrap models. High spread = low confidence. Confidence is not risk.' },
  { id: 'ext', field: 'urban', label: 'Modelling domain (urban cells)', group: 'Coverage', ramp: ['#c9bba3', '#3d6a8e'], kind: 'flag',
    help: 'Model trained only on urban cells (built-up ≥ 25%). Outside this domain predictions are extrapolations.' },
  { id: 'imp', field: 'hand_imputed', label: 'Imputed HAND (data coverage)', group: 'Coverage', ramp: ['#efece4', '#d9762b'], kind: 'flag',
    help: 'Cells where Height Above Nearest Drainage could not be routed and was imputed (KNN).' },
  { id: 'elev', field: 'elev_mean', label: 'Surface elevation (DSM)', group: 'Terrain', ramp: SEQ, kind: 'continuous',
    help: 'Copernicus GLO-30 surface model (includes buildings).' },
  { id: 'hand', field: 'hand_mean', label: 'Height above nearest drainage', group: 'Terrain', ramp: SEQ, kind: 'continuous', help: 'pysheds HAND on stream-burned DSM.' },
  { id: 'twi', field: 'twi_mean', label: 'Topographic wetness index', group: 'Terrain', ramp: SEQ, kind: 'continuous', help: 'ln(a / tan β).' },
  { id: 'dep', field: 'depression_depth_mean', label: 'Depression depth', group: 'Terrain', ramp: SEQ, kind: 'continuous', help: 'Depth of closed depressions (filled − original DSM).' },
  { id: 'dww', field: 'dist_waterway_m', label: 'Distance to mapped waterway', group: 'Hydrology', ramp: SEQ, kind: 'continuous', reverse: true, help: 'OSM rivers, canals, drains.' },
  { id: 'sarw', field: 'sar_water_occurrence', label: 'SAR open-water occurrence', group: 'Hydrology', ramp: SEQ, kind: 'continuous', help: 'Share of 297 Sentinel-1 scenes classified open water.' },
  { id: 'wb', field: 'osm_waterbody_frac', label: 'Ponds & water bodies (OSM)', group: 'Hydrology', ramp: SEQ, kind: 'continuous', help: 'Mapped water-body area fraction.' },
  { id: 'perm', field: 'perm_water_frac', label: 'Permanent water (JRC)', group: 'Hydrology', ramp: SEQ, kind: 'continuous', help: 'JRC GSW occurrence ≥ 75%.' },
  { id: 'built', field: 'lc_built_frac', label: 'Built-up fraction', group: 'Urban fabric', ramp: SEQ_WARM, kind: 'continuous', help: 'ESA WorldCover 2021.' },
  { id: 'tree', field: 'lc_tree_frac', label: 'Tree cover fraction', group: 'Urban fabric', ramp: ['#f4f1ea', '#cfdcc6', '#9fbe95', '#6f9a6c', '#4f7a5a', '#2f5a3e'], kind: 'continuous', help: 'ESA WorldCover 2021.' },
  { id: 'road', field: 'road_density_km_km2', label: 'Road density', group: 'Urban fabric', ramp: SEQ_WARM, kind: 'continuous', help: 'OSM roads, km per km².' },
  { id: 'bld', field: 'osm_building_count', label: 'Mapped buildings (OSM)', group: 'Exposure', ramp: SEQ_WARM, kind: 'continuous', log: true, help: 'OSM completeness varies spatially.' },
  { id: 'pop', field: 'population', label: 'Population (modelled)', group: 'Exposure', ramp: SEQ_WARM, kind: 'continuous', log: true, help: 'GHS-POP 2020 persons per 250 m cell (modelled).' },
]

export function quantileStops(vals: (number | null)[], n: number, log = false): number[] {
  const v = vals.filter((x): x is number => x !== null && Number.isFinite(x)).map((x) => (log ? Math.log1p(Math.max(x, 0)) : x)).sort((a, b) => a - b)
  if (!v.length) return []
  const lo = v[Math.floor(v.length * 0.02)]
  const hi = v[Math.floor(v.length * 0.98)]
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))
}

/** Build a GeoJSON FeatureCollection of grid cells (polygons from the shared corner lattice). */
export function gridToGeoJSON(g: GridData): GeoJSON.FeatureCollection {
  const W = g.width
  const cw = W + 1
  const { lon, lat } = g.corners
  const feats: GeoJSON.Feature[] = []
  for (let r = 0; r < g.height; r++) {
    for (let c = 0; c < W; c++) {
      const id = r * W + c
      const k = (rr: number, cc: number) => rr * cw + cc
      const ring = [k(r, c), k(r, c + 1), k(r + 1, c + 1), k(r + 1, c), k(r, c)].map((i) => [lon[i], lat[i]])
      const props: Record<string, number | null> = { id }
      for (const [name, arr] of Object.entries(g.fields)) {
        let v = arr[id]
        if (v !== null && LAYERS.find((L) => L.field === name)?.log) v = Math.log1p(Math.max(v, 0))
        props[name] = v
      }
      feats.push({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
  }
  return { type: 'FeatureCollection', features: feats }
}
