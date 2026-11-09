/** In-browser evaluation of the exported event-day logistic model (standardise -> linear -> sigmoid). */
export type LiveModel = { features: string[]; mean: number[]; scale: number[]; coef: number[]; intercept: number }

export function predictLive(m: LiveModel, x: Record<string, unknown>): number {
  let z = m.intercept
  m.features.forEach((f, i) => (z += (m.coef[i] * (Number(x[f] ?? 0) - m.mean[i])) / m.scale[i]))
  return 1 / (1 + Math.exp(-z))
}
