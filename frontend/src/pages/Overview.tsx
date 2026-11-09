import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import maplibregl, { type Map as MLMap } from 'maplibre-gl'
import MapCanvas from '../components/MapCanvas'
import { LEVELS, Loading, Section } from '../components/ui'
import { useStatic } from '../lib/data'
import { drawnIntensity, prefersReducedMotion, useLiveRain, useMotionMode } from '../lib/motion'
import WaterCanvas from '../components/WaterCanvas'
import type { City } from '../lib/types'

const STATUS: Record<City['status'], { color: string; label: string }> = {
  pilot: { color: '#a12f2a', label: 'Ready to explore' },
  assessed: { color: '#d9a441', label: 'Studied, map not built yet' },
  planned: { color: '#8c8579', label: 'Planned for the future' },
}

const STEPS = [
  { to: '/intelligence', title: 'Find your area on the map', text: 'Click any square on the map to see how likely that spot is to fill with water after heavy rain, and what you can do about it.' },
  { to: '/live', title: 'Check the rain today', text: 'See how much rain is expected in Kolkata over the next few days and whether it is the kind of rain that usually causes waterlogging.' },
  { to: '/events', title: 'Look back at past floods', text: 'Read about days when Kolkata streets went under water, which places were hit and how much it rained.' },
  { to: '/exposure', title: 'See who is affected', text: 'Find out how many people, hospitals and schools sit in the areas that waterlog most often.' },
]

const MORE = [
  { to: '/forecasting', title: 'Forecasting', text: 'How much warning can rain give us? Try the rain slider to see how risky different amounts of rain are.' },
  { to: '/research', title: 'Research & Models', text: 'How accurate the map is, in plain words, with the full test results underneath.' },
  { to: '/observatory', title: 'Data Observatory', text: 'Every source of information we used, where it came from and what its weaknesses are.' },
  { to: '/methodology', title: 'Methodology', text: 'The complete technical explanation, for researchers and engineers.' },
]

const TIPS = [
  'On the map, type a place name such as "Behala" or "Park Street" into the search box and press Go.',
  'Click a coloured square to open a panel on the right that explains what it means for that spot.',
  'Use the "Timeline" box on the map to show only the places reported under water on one particular day.',
  'Every page starts with a short, simple summary. Press "Show technical details" if you want the numbers behind it.',
  'On a phone, the map comes first. Scroll down for the layer list and the details panel.',
]

export default function Overview() {
  const cities = useStatic<{ cities: City[] }>('cities.json')
  const mode = useMotionMode()
  const rain = useLiveRain()

  const onReady = useCallback((m: MLMap) => {
    for (const c of cities.data?.cities ?? []) {
      const el = document.createElement('div')
      const st = STATUS[c.status]
      const size = c.status === 'pilot' ? 14 : 10
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${c.status === 'planned' ? 'transparent' : st.color};border:2px solid ${st.color};box-shadow:0 0 0 2px #fff`
      new maplibregl.Marker({ element: el }).setLngLat(c.centre).setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<b>${c.name}</b><br/><span style="font-size:12px">${st.label}</span>`)).addTo(m)
    }
  }, [cities.data])

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-ink text-paper">
        <WaterCanvas variant="dark" intensity={drawnIntensity(mode, rain)} animate={mode !== 'off' && !prefersReducedMotion()} waveHeight={0.22} />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-10 md:px-8 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-amber">Kolkata · monsoon waterlogging</div>
            <h1 className="h-serif mt-3 text-3xl font-semibold leading-tight md:text-[40px]">Which parts of Kolkata fill with water when it rains heavily?</h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-[#d5deea]">
              Almost every monsoon, streets in Kolkata go under water after heavy rain. This website shows <b>where that tends to happen</b>,
              <b> what kind of rain causes it</b>, and <b>who lives and works in those places</b>. It is built from news reports of past
              waterlogging, maps of the land and buildings, and rainfall records.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[14px]">
              <Link to="/intelligence" className="bg-amber px-4 py-2.5 font-semibold text-ink no-underline hover:no-underline">Open the map</Link>
              <Link to="/live" className="border border-[#3b4d66] px-4 py-2.5 text-paper no-underline hover:no-underline">Check today's rain</Link>
            </div>
          </div>
          <div className="h-[300px] border border-[#24344a] lg:h-auto">
            {cities.data ? <MapCanvas center={[80.5, 21.5]} zoom={3.6} className="h-full min-h-[300px] w-full" onReady={onReady} /> : <Loading what="map" />}
          </div>
        </div>
      </section>

      <Section kicker="Getting started" title="How to use this website">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Link key={s.to} to={s.to} className="group block border border-line bg-white p-4 text-ink no-underline hover:border-ink hover:no-underline">
              <div className="num text-[12px] text-amber">Step {i + 1}</div>
              <div className="mt-1 text-[16px] font-semibold group-hover:underline">{s.title}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-slate">{s.text}</p>
            </Link>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="border border-line bg-white p-4">
            <div className="text-[15px] font-semibold">The other pages</div>
            <ul className="mt-2 space-y-2">
              {MORE.map((m) => (
                <li key={m.to} className="text-[14px] leading-relaxed text-slate"><Link to={m.to} className="font-semibold">{m.title}</Link>: {m.text}</li>
              ))}
            </ul>
          </div>
          <div className="border border-line bg-white p-4">
            <div className="text-[15px] font-semibold">Handy tips</div>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {TIPS.map((t) => <li key={t} className="text-[14px] leading-relaxed text-slate">{t}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section kicker="Reading the map" title="What the colours mean">
        <div className="grid gap-2 sm:grid-cols-5">
          {LEVELS.map((l) => (
            <div key={l.key} className="border border-line bg-white p-3">
              <div className="h-3 w-full" style={{ background: l.color }} />
              <div className="mt-2 text-[14px] font-semibold">{l.short}</div>
              <div className="text-[13px] text-slate">{l.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-slate">
          Colours compare places <b>within Kolkata</b>. "Very high" means the area looks most like places that have been reported under water
          before. It does not mean it will flood on any particular day, and a light colour does not guarantee an area stays dry.
        </p>
      </Section>

      <Section kicker="In short" title="What we learned">
        <div className="grid gap-3 lg:grid-cols-2">
          {[
            ['Waterlogging is worst in the old, crowded centre', 'Places like Thanthania, Amherst Street, Park Circus, Ballygunge and the area around central hospitals come up again and again. Some newer areas in the south (Behala, Sarsuna, Joka) and east (Salt Lake) also flood, and the map is less good at spotting them.'],
            ['It happens on the same day as the rain', 'Streets usually go under water when a lot of rain falls within a few hours. We can tell when the day\'s rain looks risky, but we cannot reliably warn a full day in advance.'],
            ['Satellites cannot see it', 'The water usually drains within hours and sits between buildings. Satellite photos, taken only every 6 to 12 days, almost always miss it. So we rely on news reports instead.'],
            ['The map is a guide, not a guarantee', 'It is based on places that made the news. Areas that flood but were never reported may look safer than they really are.'],
          ].map(([t, d]) => (
            <div key={t} className="border-l-4 border-amber bg-white p-4">
              <div className="text-[16px] font-semibold">{t}</div>
              <p className="mt-1 text-[14.5px] leading-relaxed text-slate">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="Where this comes from" title="Built from public information">
        <div className="grid gap-4 md:grid-cols-4">
          {[['93', 'places reported as waterlogged in the news'], ['24', 'days with reported waterlogging, 2016 to 2026'], ['12', 'public sources of maps, rain and population data'], ['17,000', 'small squares, each about the size of a few city blocks']].map(([n, l]) => (
            <div key={l} className="border-l-2 border-line pl-3"><div className="num text-2xl">{n}</div><div className="text-[14px] text-slate">{l}</div></div>
          ))}
        </div>
        <p className="mt-4 text-[14px] text-slate">Want the full technical story? Read the <Link to="/methodology">Methodology</Link>.</p>
      </Section>

      <Section kicker="Other cities" title="Which cities are covered">
        {cities.data ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
            {cities.data.cities.map((c) => <span key={c.id}><span style={{ color: STATUS[c.status].color }}>●</span> {c.name}: <span className="text-slate">{STATUS[c.status].label}</span></span>)}
          </div>
        ) : <Loading />}
      </Section>

      <Section>
        <div className="border border-[#e8c3bd] bg-[#fbf1ef] p-4 text-[14.5px] text-[#6b2a24]">
          <b>This is a research project, not an official warning.</b> During heavy rain, follow the advice of the{' '}
          <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">India Meteorological Department</a> and the Kolkata Municipal Corporation.
        </div>
      </Section>
    </div>
  )
}
