import { useEffect, useMemo, useState } from 'react'
import EChart, { AXIS } from '../components/EChart'
import { Callout, Details, ErrorBox, Kind, Loading, PageHeader, Panel, Section, Stat } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import { BANDS, band, predictLive, rainWords } from '../lib/model'

type LiveModel = { features: string[]; mean: number[]; scale: number[]; coef: number[]; intercept: number; trained_on: string; output: string }
type OM = { hourly: { time: string[]; precipitation: (number | null)[] } }

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&hourly=precipitation&past_days=3&forecast_days=3&timezone=GMT'
const IST_MS = 5.5 * 3600e3

function features(times: number[], p: number[], dayStartUtcMs: number) {
  const end = dayStartUtcMs + 24 * 3600e3
  const inWin = (a: number, b: number) => times.map((t, i) => [t, p[i]] as const).filter(([t]) => t > a && t <= b).map(([, v]) => v)
  const w24 = inWin(end - 24 * 3600e3, end)
  const w48 = inWin(end - 48 * 3600e3, end)
  const ante = inWin(end - 120 * 3600e3, end - 48 * 3600e3)
  const roll = (a: number[], k: number) => a.reduce((m, _, i) => (i + 1 >= k ? Math.max(m, a.slice(i + 1 - k, i + 1).reduce((s, v) => s + v, 0)) : m), 0)
  return {
    era5_24h: w24.reduce((s, v) => s + v, 0), era5_48h: w48.reduce((s, v) => s + v, 0), era5_max1h: Math.max(0, ...w48),
    era5_max3h: roll(w48, 3), era5_max6h: roll(w48, 6), era5_antecedent_72h: ante.reduce((s, v) => s + v, 0), complete: w48.length === 48,
  }
}

export default function Live() {
  const models = useStatic<{ dynamic: { live_model: LiveModel } }>('kolkata/models.json')
  const [om, setOm] = useState<OM | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const load = () => {
    setErr(null)
    fetch(URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((j) => { setOm(j); setFetchedAt(new Date()) }).catch((e) => setErr(String(e.message || e)))
  }
  useEffect(load, [])
  const lm = models.data?.dynamic.live_model

  const view = useMemo(() => {
    if (!om) return null
    const times = om.hourly.time.map((t) => Date.parse(t + 'Z'))
    const p = om.hourly.precipitation.map((v) => v ?? 0)
    const now = Date.now()
    const istNow = new Date(now + IST_MS)
    const todayStart = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_MS
    const days = [-1, 0, 1, 2].map((k) => {
      const s = todayStart + k * 86400e3
      return { label: ['Yesterday', 'Today', 'Tomorrow', 'Day after'][k + 1], start: s, past: s + 86400e3 <= now, ...features(times, p, s) }
    })
    return { times, p, now, days }
  }, [om])

  return (
    <div>
      <PageHeader eyebrow="Live conditions" title="Will Kolkata's streets flood in the next few days?">
        We check the latest rain forecast every time you open this page and tell you, in plain words, whether it is the kind of rain that
        usually leaves Kolkata's streets under water.
      </PageHeader>
      <Section>
        {err && <ErrorBox error={err} hint="We could not reach the weather service, so nothing is shown. Please try again later." />}
        {!om && !err && <Loading what="the latest rain forecast" />}
        {view && lm && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {view.days.map((d) => {
                const b = band(predictLive(lm, d))
                return (
                  <div key={d.label} className={`border bg-white ${d.label === 'Today' ? 'border-ink' : 'border-line'}`}>
                    <div className="h-2" style={{ background: b.color }} />
                    <div className="p-4">
                      <div className="flex items-baseline justify-between"><span className="text-[16px] font-semibold">{d.label}</span><span className="text-[12px] text-mute">{fmt.date(new Date(d.start + IST_MS).toISOString().slice(0, 10))}</span></div>
                      <div className="mt-2 text-[17px] font-semibold leading-snug" style={{ color: b.color === '#7fa58a' ? '#3f6b4c' : b.color }}>{b.label}</div>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-slate">{b.text}</p>
                      <div className="mt-3 border-t border-paper-2 pt-2 text-[13.5px] text-slate">
                        <div><b>{rainWords(d.era5_24h)}</b>{d.past ? ' fell' : ' expected'}: about {Math.round(d.era5_24h)} mm</div>
                        <div className="text-[12.5px]">Heaviest hour: about {d.era5_max1h.toFixed(0)} mm</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[12px] text-mute">Updated {fetchedAt?.toLocaleTimeString()} from the Open-Meteo weather service. <button onClick={load} className="underline">Refresh</button></p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="border border-line bg-white p-5">
                <div className="text-[16px] font-semibold">What do these words mean?</div>
                <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-slate">
                  {BANDS.map((b) => <li key={b.label}><span className="mr-2 inline-block h-3 w-3 align-middle" style={{ background: b.color }} /><b>{b.label}.</b> {b.text}</li>)}
                </ul>
                <p className="mt-3 text-[13.5px] leading-relaxed text-slate">These labels come from comparing rain with past days when the news reported flooded streets in Kolkata. They describe the city as a whole. To see which streets are most at risk, use the <a href="#/intelligence">map</a>.</p>
              </div>
              <div className="border border-line bg-white p-5">
                <div className="text-[16px] font-semibold">If heavy rain is coming</div>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-slate">
                  <li>Avoid walking through standing water. It can hide open drains, and live electric wires have caused deaths in Kolkata floods.</li>
                  <li>Do not drive into underpasses or deep water.</li>
                  <li>Move valuables, medicines and electrical items off the floor if your ground floor tends to flood.</li>
                  <li>Plan trips to hospitals or work around the heaviest rain if you can. Water usually drains within a few hours.</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 border border-[#e8c3bd] bg-[#fbf1ef] p-4 text-[14px] text-[#6b2a24]">
              <b>This is not an official warning.</b> Forecasts can miss short, intense downpours. Always follow the{' '}
              <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">India Meteorological Department</a> and the Kolkata Municipal Corporation.
            </div>
          </>
        )}
      </Section>

      {view && lm && (
        <Section>
          <div className="border border-line bg-white">
            <Details title="How did we get this?">
              <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
                <Panel title="Hourly precipitation, past 3 days and next 3 days (city centre)" note={<span><Kind k="forecast" /> fetched {fetchedAt?.toLocaleTimeString()}</span>}>
                  <EChart height={300} option={{
                    tooltip: { trigger: 'axis' }, grid: { left: 44, right: 16, top: 16, bottom: 40 },
                    xAxis: { type: 'time', ...AXIS }, yAxis: { type: 'value', name: 'mm / h', ...AXIS },
                    series: [{ type: 'bar', data: view.times.map((t, i) => [t, view.p[i]]), itemStyle: { color: (pp: { value: [number, number] }) => (pp.value[0] > view.now ? '#a9c1d3' : '#3d6a8e') }, barMaxWidth: 6,
                      markLine: { symbol: 'none', data: [{ xAxis: view.now, label: { formatter: 'now', fontSize: 10 }, lineStyle: { color: '#a8322d' } }] } }],
                  }} />
                  <p className="text-[11.5px] text-mute">Dark bars: weather-model analysis of past hours (not rain-gauge observations). Light bars: forecast. Source: Open-Meteo forecast API (CC BY 4.0), point 22.5726 N, 88.3639 E.</p>
                </Panel>
                <Panel title="Event-day model inputs and output">
                  <table className="data">
                    <thead><tr><th>Day (IST)</th><th className="text-right">48 h mm</th><th className="text-right">max 1 h</th><th className="text-right">max 3 h</th><th className="text-right">P(event)</th></tr></thead>
                    <tbody>{view.days.map((d) => (
                      <tr key={d.label}><td>{d.label}{!d.complete && <span className="text-orange"> (partial)</span>}</td><td className="num text-right">{d.era5_48h.toFixed(1)}</td><td className="num text-right">{d.era5_max1h.toFixed(1)}</td><td className="num text-right">{d.era5_max3h.toFixed(1)}</td><td className="num text-right">{fmt.pct(predictLive(lm, d), 2)}</td></tr>
                    ))}</tbody>
                  </table>
                  <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-slate">
                    <Stat label="Model" value="" sub={`Logistic regression on ERA5 hourly rainfall features (48 h total, max 1/3/6 h, 72 h antecedent). Output: ${lm.output}. Trained on ${lm.trained_on}.`} />
                    <p>Bands: below 1% (17% of documented event days fall here), 1 to 2%, 2 to 5%, and 5% or more (21% of event days but only about 2% of other monsoon days, 2016 to 2026).</p>
                    <p>Rain words use IMD 24-hour categories: very light &lt; 2.5 mm, light 2.5 to 15.5, moderate 15.6 to 64.4, heavy 64.5 to 115.5, very heavy 115.6 to 204.4, extremely heavy 204.5 mm or more.</p>
                  </div>
                </Panel>
              </div>
              <div className="px-4 pb-4"><Callout tone="warn">Experimental: forecast models differ from the ERA5 reanalysis used in training (domain shift), and the model has not been validated on forecast inputs. Short convective bursts are often missed by forecasts. Probabilities are a lower bound because many waterlogging days are never reported.</Callout></div>
            </Details>
          </div>
        </Section>
      )}
    </div>
  )
}
