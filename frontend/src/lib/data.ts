/**
 * Data access. Mode A (default): precomputed JSON shipped with the site under /data.
 * Mode B: if VITE_API_BASE is set and /api/health answers, live endpoints are used where available
 * (scenario inference, point queries). Every consumer must handle loading and error states.
 */
import { useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL || '/'
export const API_BASE: string | undefined = import.meta.env.VITE_API_BASE || undefined

const cache = new Map<string, Promise<unknown>>()

export function staticUrl(path: string): string {
  return `${BASE}data/${path}`.replace(/\/{2,}/g, '/')
}

export function fetchJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`)
        return r.json()
      }).catch((e) => {
        cache.delete(url)
        throw e
      }),
    )
  }
  return cache.get(url) as Promise<T>
}

export type Loadable<T> = { data?: T; error?: string; loading: boolean }

export function useStatic<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ loading: !!path })
  useEffect(() => {
    if (!path) return
    let alive = true
    setState({ loading: true })
    fetchJson<T>(staticUrl(path))
      .then((d) => alive && setState({ data: d, loading: false }))
      .catch((e) => alive && setState({ error: String(e.message || e), loading: false }))
    return () => {
      alive = false
    }
  }, [path])
  return state
}

export type ApiStatus = 'static' | 'checking' | 'online' | 'offline'

export function useApiStatus(): ApiStatus {
  const [s, setS] = useState<ApiStatus>(API_BASE ? 'checking' : 'static')
  useEffect(() => {
    if (!API_BASE) return
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 4000)
    fetch(`${API_BASE}/api/health`, { signal: ctl.signal })
      .then((r) => setS(r.ok ? 'online' : 'offline'))
      .catch(() => setS('offline'))
      .finally(() => clearTimeout(t))
    return () => ctl.abort()
  }, [])
  return s
}

export const fmt = {
  n: (v: number | null | undefined, d = 0) =>
    v === null || v === undefined || Number.isNaN(v) ? 'n/a' : v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }),
  pct: (v: number | null | undefined, d = 1) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(d)}%`),
  date: (s: string) => new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  ts: (s: string) => new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
}
