export type FieldMeta = { label: string; unit: string; kind: 'observed' | 'derived' | 'model' | 'modelled'; source: string }

export type GridData = {
  generated_utc: string
  city: string
  crs: string
  res_m: number
  height: number
  width: number
  corners: { lon: number[]; lat: number[] }
  fields: Record<string, (number | null)[]>
  field_meta: Record<string, FieldMeta>
  classes: string[]
  roles: string[]
  shap_top3: { f: string; v: number }[][]
  notes: string[]
}

export type City = {
  id: string
  name: string
  state: string
  status: 'pilot' | 'assessed' | 'planned'
  centre: [number, number]
  bbox: [number, number, number, number]
  has_outputs: boolean
}

export type Score = {
  n: number
  n_pos: number
  prevalence: number
  roc_auc: number
  pr_auc: number
  pr_auc_lift: number
  brier: number | null
  ece: number | null
  threshold: number
  precision: number
  recall: number
  specificity: number
  f1: number
  balanced_accuracy: number
  confusion_matrix: [[number, number], [number, number]]
  ci95_block_bootstrap?: Record<string, [number, number]>
  ci95_year_bootstrap?: Record<string, [number, number]>
}

export type Curves = {
  roc: { fpr: number[]; tpr: number[] }
  pr: { recall: number[]; precision: number[] }
  calibration: { mean_pred: number; obs_freq: number; n: number }[]
}

export type EventSource = {
  type: string
  outlet: string
  url: string
  published_ist?: string | null
  date_basis?: string
  summary?: string
  uei?: string
  cause?: string
  fatalities?: number | null
  damage?: string | null
}

export type FloodEvent = {
  date: string
  year: number
  localities: string[]
  n_localities: number
  sources: EventSource[]
  rainfall: Record<string, number | null>
  hourly: { t_utc: string[]; era5_mm: number[]; imerg_t_utc?: string[]; imerg_mm_per_30min?: number[] }
  'sentinel1_within_-1_+3_days': { date: string; orbit: string; time_utc: string; coverage: number | null; new_water_frac_vs_previous: number | null; previous: string | null }[]
  source_confidence: string
  in_event_day_model: boolean
  limitations: string
}

export type LocalityFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { locality: string; cell_id: number; uncertainty_m: number; osm_match: string; n_events: number; events: string[]; sources: string[] }
}
