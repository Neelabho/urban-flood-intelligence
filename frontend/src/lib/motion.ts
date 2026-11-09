/**
 * Background motion settings and live rain intensity.
 * mode: 'live'    -> background rain follows the current rain in Kolkata (Open-Meteo)
 *       'preview' -> heavy-rain preview
 *       'off'     -> static background
 * The user's choice is remembered in localStorage (wrapped in try/catch: storage can be unavailable).
 */
import { useEffect, useSyncExternalStore } from 'react'

export type MotionMode = 'live' | 'preview' | 'off'
const KEY = 'ufii-motion'
const PREVIEW_MM_H = 12

function read(): MotionMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'live' || v === 'preview' || v === 'off') return v
  } catch {
    /* storage unavailable */
  }
  return 'live'
}

let mode: MotionMode = read()
const listeners = new Set<() => void>()

export function setMotionMode(m: MotionMode) {
  mode = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useMotionMode(): MotionMode {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => mode, () => mode)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ---- live rain (shared across components, refreshed every 15 minutes)
type Rain = { mmPerHour: number | null; fetchedAt: number | null; error: boolean }
let rain: Rain = { mmPerHour: null, fetchedAt: null, error: false }
const rainListeners = new Set<() => void>()
let inflight = false

async function refreshRain() {
  if (inflight || (rain.fetchedAt && Date.now() - rain.fetchedAt < 15 * 60e3)) return
  inflight = true
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current=precipitation&timezone=GMT')
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    rain = { mmPerHour: Number(j?.current?.precipitation ?? 0), fetchedAt: Date.now(), error: false }
  } catch {
    rain = { ...rain, fetchedAt: Date.now(), error: true }
  } finally {
    inflight = false
    rainListeners.forEach((l) => l())
  }
}

export function useLiveRain(): Rain {
  const r = useSyncExternalStore((cb) => (rainListeners.add(cb), () => rainListeners.delete(cb)), () => rain, () => rain)
  useEffect(() => {
    refreshRain()
    const t = setInterval(refreshRain, 15 * 60e3)
    return () => clearInterval(t)
  }, [])
  return r
}

/** Rain intensity actually drawn, in mm/h. */
export function drawnIntensity(m: MotionMode, r: Rain): number {
  if (m === 'preview') return PREVIEW_MM_H
  if (m === 'off') return 0
  return r.mmPerHour ?? 0
}

export function rainLabel(mmh: number | null): string {
  if (mmh === null) return 'rain data unavailable'
  if (mmh < 0.1) return 'no rain in Kolkata right now'
  if (mmh < 2.5) return `light rain in Kolkata right now (${mmh.toFixed(1)} mm per hour)`
  if (mmh < 7.6) return `moderate rain in Kolkata right now (${mmh.toFixed(1)} mm per hour)`
  return `heavy rain in Kolkata right now (${mmh.toFixed(1)} mm per hour)`
}
