/** In-browser evaluation of the exported event-day logistic model (standardise -> linear -> sigmoid). */
export type LiveModel = { features: string[]; mean: number[]; scale: number[]; coef: number[]; intercept: number }

export function predictLive(m: LiveModel, x: Record<string, unknown>): number {
  let z = m.intercept
  m.features.forEach((f, i) => (z += (m.coef[i] * (Number(x[f] ?? 0) - m.mean[i])) / m.scale[i]))
  return 1 / (1 + Math.exp(-z))
}

/** Bands chosen from the 2016 to 2026 record (see the technical section). */
export const BANDS = [
  { min: 0.05, label: 'Waterlogging likely in many areas', color: '#a12f2a', text: 'Rain like this is rare. On days like this, streets in many parts of the city have gone under water.' },
  { min: 0.02, label: 'Waterlogging likely in the usual problem spots', color: '#cf6537', text: 'Water usually collects on streets that often flood, such as parts of central and south Kolkata.' },
  { min: 0.01, label: 'Some low spots may waterlog', color: '#e7a35b', text: 'Water may collect briefly in a few dips and underpasses.' },
  { min: 0, label: 'Waterlogging unlikely', color: '#7fa58a', text: 'Not enough rain to cause waterlogging in most places.' },
]
export const band = (p: number) => BANDS.find((b) => p >= b.min)!

/** India Meteorological Department categories for 24-hour rainfall. */
export function rainWords(mm: number): string {
  if (mm < 0.1) return 'No rain'
  if (mm < 2.5) return 'Very light rain'
  if (mm < 15.6) return 'Light rain'
  if (mm < 64.5) return 'Moderate rain'
  if (mm < 115.6) return 'Heavy rain'
  if (mm < 204.5) return 'Very heavy rain'
  return 'Extremely heavy rain'
}

