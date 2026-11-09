import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApiStatus, useStatic } from '../lib/data'
import { drawnIntensity, prefersReducedMotion, rainLabel, setMotionMode, useLiveRain, useMotionMode, type MotionMode } from '../lib/motion'
import WaterCanvas from './WaterCanvas'
import SEO from '../seo-pages.json'
import type { City } from '../lib/types'

const NAV = [
  ['/', 'Overview'],
  ['/intelligence', 'Flood Intelligence'],
  ['/live', 'Live Conditions'],
  ['/forecasting', 'Forecasting'],
  ['/events', 'Historical Events'],
  ['/exposure', 'Exposure'],
  ['/research', 'Research & Models'],
  ['/observatory', 'Data Observatory'],
  ['/methodology', 'Methodology'],
  ['/about', 'About'],
] as const

export default function Layout() {
  const api = useApiStatus()
  const cities = useStatic<{ cities: City[]; default_city: string }>('cities.json')
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    // keep the tab title, description and canonical URL in step with the current page
    const key = '/' + loc.pathname.split('/').filter(Boolean)[0]
    const page = (SEO.pages as Record<string, { title: string; description: string }>)[key === '/undefined' ? '/' : key] ?? SEO.pages['/']
    document.title = page.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', page.description)
    const site = (import.meta.env.VITE_SITE_URL || SEO.default_site_url).replace(/\/$/, '')
    const path = key === '/undefined' || key === '/' ? '/' : `${key}/`
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', site + path)
  }, [loc.pathname])
  const pilot = cities.data?.cities.find((c) => c.status === 'pilot')
  const mode = useMotionMode()
  const rain = useLiveRain()
  const reduced = prefersReducedMotion()
  const animate = mode !== 'off' && !reduced
  return (
    <div className="relative flex min-h-full flex-col">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <WaterCanvas variant="light" intensity={drawnIntensity(mode, rain)} animate={animate} />
      </div>
      <header className="sticky top-0 z-30 bg-ink text-paper">
        <div className="flex items-center gap-4 px-4 py-2.5 md:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 text-paper no-underline hover:no-underline">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="4" fill="#1c2a3f" /><path d="M6 20c3-3 5-3 8 0s5 3 8 0 4-2 4-2" stroke="#e0a24a" strokeWidth="2.6" fill="none" /><path d="M6 13c3-3 5-3 8 0s5 3 8 0 4-2 4-2" stroke="#f7f5f0" strokeWidth="2" fill="none" opacity=".7" /></svg>
            <div className="leading-tight">
              <div className="h-serif text-[15px] font-semibold tracking-tight">Urban Flood Intelligence India</div>
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-[#9fb0c4]">UFII · research platform</div>
            </div>
          </NavLink>
          <div className="ml-auto flex items-center gap-3 text-[11px]">
            <label className="hidden items-center gap-1.5 sm:flex">
              <span className="text-[#9fb0c4]">City</span>
              <select className="border border-[#33445c] bg-ink-2 px-2 py-1 text-[12px] text-paper" value={pilot?.id ?? 'kolkata'} onChange={() => undefined} aria-label="City">
                {cities.data?.cities.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.has_outputs}>
                    {c.name}{c.has_outputs ? '' : c.status === 'assessed' ? ' (studied, map not built yet)' : ' (planned)'}
                  </option>
                ))}
              </select>
            </label>
            <span className="hidden items-center gap-1.5 text-[#9fb0c4] md:flex" title="Data mode">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${api === 'online' ? 'bg-[#7fb38c]' : 'bg-[#9fb0c4]'}`} />
              {api === 'online' ? 'Live server connected' : api === 'checking' ? 'Connecting…' : api === 'offline' ? 'Server offline, using saved data' : 'Using saved data'}
            </span>
            <button className="border border-[#33445c] px-2 py-1 lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
              Menu
            </button>
          </div>
        </div>
        <nav className={`${open ? 'block' : 'hidden'} border-t border-[#24344a] lg:block`}>
          <ul className="flex flex-col px-2 lg:flex-row lg:px-4">
            {NAV.map(([to, label]) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `block border-b-2 px-3 py-2 text-[12.5px] font-medium no-underline hover:no-underline lg:py-2.5 ${isActive ? 'border-amber text-paper' : 'border-transparent text-[#b9c6d6] hover:text-paper'}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="relative z-10 flex-1">
        <Outlet />
      </main>
      <footer className="relative z-10 border-t border-line bg-paper-2/90 px-4 py-5 text-[12px] text-mute md:px-8">
        <div className="mx-auto mb-3 flex max-w-7xl flex-wrap items-center gap-2 border-b border-line pb-3">
          <span className="text-slate">Background animation:</span>
          {([['live', 'Live rain'], ['preview', 'Preview heavy rain'], ['off', 'Off']] as [MotionMode, string][]).map(([m, l]) => (
            <button key={m} onClick={() => setMotionMode(m)} aria-pressed={mode === m}
              className={`border px-2 py-0.5 ${mode === m ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-slate hover:border-ink'}`}>{l}</button>
          ))}
          <span className="text-mute">
            {reduced ? 'Paused because your device asks for reduced motion.' : mode === 'live' ? `The rain in the background matches the real weather: ${rainLabel(rain.mmPerHour)}. Move or click to make ripples.` : mode === 'preview' ? 'Showing what heavy rain looks like. This is not the real weather.' : 'Animation is off.'}
          </span>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3">
          <div>
            Research prototype. Not an official warning service. Follow{' '}
            <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">IMD</a> and municipal advisories.
          </div>
          <div>
            Data: Copernicus, ESA, JRC, IMD, UCSB-CHC, ECMWF/Open-Meteo, © OpenStreetMap contributors. See Data Observatory.
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-7xl border-t border-line pt-3 text-[13px] text-slate">
          Developed by <a href="https://github.com/Neelabho" target="_blank" rel="noreferrer author" className="font-semibold">Neelabho Chakraborty</a>
        </div>
      </footer>
    </div>
  )
}
