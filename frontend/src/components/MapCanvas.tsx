import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MLMap, type StyleSpecification } from 'maplibre-gl'

// OpenFreeMap: OSM-based vector tiles, no API key. Fallback: OSM raster tiles.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.8, 'raster-opacity': 0.75 } }],
}

type Props = {
  center: [number, number]
  zoom: number
  className?: string
  onReady?: (map: MLMap) => void
  interactive?: boolean
}

export default function MapCanvas({ center, zoom, className = '', onReady, interactive = true }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!ref.current) return
    let usedFallback = false
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE_URL,
      center,
      zoom,
      interactive,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    })
    map.on('error', (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? '')
      if (!usedFallback && /style|Failed to fetch|NetworkError/i.test(msg) && !map.isStyleLoaded()) {
        usedFallback = true
        map.setStyle(FALLBACK_STYLE)
        setErr('Vector basemap unavailable; using OpenStreetMap raster tiles.')
      }
    })
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    }
    map.once('load', () => onReady?.(map))
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className={`relative ${className}`}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {err && <div className="absolute bottom-8 left-2 bg-white/90 px-2 py-1 text-[11px] text-orange">{err}</div>}
    </div>
  )
}
