import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import maplibregl, { type Map as MLMap } from 'maplibre-gl'
import MapCanvas from '../components/MapCanvas'
import { Callout, ErrorBox, Kind, Loading, Panel, Section, Stat, Timestamp } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import type { City, Score } from '../lib/types'

type Models = {
  generated_utc: string
  susceptibility: { models: Record<string, { spatial_cv: Score }>; holdout_test: Record<string, Score>; spatiotemporal: Record<string, Score> }
  susceptibility_design: Record<string, number>
  dynamic: { n_days: number; n_event_days: number; product_comparison: { results: Record<string, { logistic_loyo: Score }> }; lead_time: Record<string, Score> }
}

const STATUS_STYLE: Record<City['status'], { color: string; label: string }> = {
  pilot: { color: '#a12f2a', label: 'Pilot — fully modelled' },
  assessed: { color: '#d9a441', label: 'Assessed for feasibility, not modelled' },
  planned: { color: '#8c8579', label: 'Planned (registry only)' },
}

export default function Overview() {
  const cities = useStatic<{ cities: City[]; generated_utc: string }>('cities.json')
  const models = useStatic<Models>('kolkata/models.json')
  const quality = useStatic<{ generated_utc: string; catalog: { id: string; title: string; period: string; nature: string }[]; manifest_summary: { n_artifacts: number; total_bytes: number; first_download: string; last_download: string }; feasibility: { weighted_totals_base: Record<string, number>; decision: string } }>('kolkata/data_quality.json')
  const events = useStatic<{ events: { date: string; n_localities: number; in_event_day_model: boolean }[] }>('kolkata/events.json')

  const onReady = useCallback((m: MLMap) => {
    for (const c of cities.data?.cities ?? []) {
      const el = document.createElement('div')
      const st = STATUS_STYLE[c.status]
      el.style.cssText = `width:${c.status === 'pilot' ? 14 : 10}px;height:${c.status === 'pilot' ? 14 : 10}px;border-radius:50%;background:${c.status === 'planned' ? 'transparent' : st.color};border:2px solid ${st.color};box-shadow:0 0 0 2px #fff`
      new maplibregl.Marker({ element: el }).setLngLat(c.centre).setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<b>${c.name}</b>, ${c.state}<br/><span style="font-size:11px">${st.label}</span>`)).addTo(m)
    }
  }, [cities.data])

  const m = models.data
  const sd = m?.susceptibility_design
  const best = m ? Object.entries(m.susceptibility.models).sort((a, b) => b[1].spatial_cv.roc_auc - a[1].spatial_cv.roc_auc)[0] : null
  const nEv = events.data?.events.filter((e) => e.in_event_day_model).length
  const nArchival = events.data ? events.data.events.length - (nEv ?? 0) : undefined

  return (
    <div>
      <section className="border-b border-line bg-ink text-paper">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:px-8 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber">Research platform · pilot city Kolkata</div>
            <h1 className="h-serif mt-3 text-3xl font-semibold leading-tight md:text-[40px]">Where does Kolkata waterlog — and how sure can we be?</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#c9d4e1]">
              UFII integrates satellite, terrain, land-cover, rainfall and infrastructure data with documented waterlogging reports to
              estimate <em>relative</em> urban flood susceptibility, test how rainfall triggers documented events, and make every data source,
              uncertainty and limitation inspectable.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
              <Link to="/intelligence" className="bg-amber px-4 py-2 font-semibold text-ink no-underline hover:no-underline">Open the intelligence map</Link>
              <Link to="/methodology" className="border border-[#3b4d66] px-4 py-2 text-paper no-underline hover:no-underline">Read the methodology</Link>
            </div>
          </div>
          <div className="h-[300px] border border-[#24344a] lg:h-auto">
            {cities.data ? <MapCanvas center={[80.5, 21.5]} zoom={3.6} className="h-full min-h-[300px] w-full" onReady={onReady} /> : <Loading what="city registry" />}
          </div>
        </div>
      </section>

      <Section kicker="Six distinct things this platform shows" title="Read every number with its type">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['model', 'Static susceptibility', 'Relative likelihood that a 250 m cell hosts documented waterlogging, from terrain, hydrology and urban-fabric features. Not a forecast.'],
            ['model', 'Dynamic (rainfall-conditioned) risk', 'City-scale probability that a day is a documented waterlogging day, given rainfall. Validated by leave-one-season-out CV.'],
            ['forecast', 'Short-term forecasting', 'No hourly flood labels exist; we report how skill decays as rainfall information is withheld, and show live rainfall forecasts — which are not flood forecasts.'],
            ['reported', 'Observed historical events', 'Dated, source-cited waterlogging reports and India Flood Inventory entries. Observed extent maps do not exist for these events.'],
            ['modelled', 'Exposure estimates', 'Population (modelled), buildings, roads and facilities in each susceptibility class: potential exposure, not observed impact.'],
            ['simulated', 'Simulated scenarios', 'What-if rainfall totals passed through the event-day model, clearly separated from observations.'],
          ].map(([k, t, d]) => (
            <div key={t} className="border border-line bg-white p-4">
              <Kind k={k} />
              <div className="mt-2 font-semibold text-ink">{t}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="Pilot city" title="Kolkata at a glance">
        {models.error && <ErrorBox error={models.error} />}
        {!m ? <Loading /> : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Data coverage" note={<Timestamp iso={quality.data?.generated_utc} />}>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Analysis grid" value="16,875" sub="250 m cells, UTM 45N" />
                <Stat label="Datasets" value={quality.data?.catalog.length ?? '—'} sub="verified public sources" />
                <Stat label="Sentinel-1 scenes" value="472" sub="2017–2025, May–Nov" />
                <Stat label="Downloaded artefacts" value={quality.data?.manifest_summary.n_artifacts ?? '—'} sub={quality.data ? `${fmt.n(quality.data.manifest_summary.total_bytes / 1e6, 0)} MB, provenance logged` : ''} />
              </div>
            </Panel>
            <Panel title="Observations">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Documented localities" value={sd?.n_positive_cells ?? '—'} sub="positive cells (83 geocoded localities)" />
                <Stat label="Event days modelled" value={nEv ?? '—'} sub="2016–2026 monsoons" />
                <Stat label="Archival events" value={nArchival ?? '—'} sub="IFI entries 1975–2015" />
                <Stat label="Background cells" value={fmt.n(sd?.n_background_cells)} sub="urban, unlabelled" />
              </div>
            </Panel>
            <Panel title="Model validation status">
              <table className="data">
                <tbody>
                  <tr><td>Susceptibility · spatial CV</td><td className="num text-right">ROC-AUC {best?.[1].spatial_cv.roc_auc.toFixed(2)}</td></tr>
                  <tr><td>Susceptibility · held-out blocks</td><td className="num text-right">{m.susceptibility.holdout_test.xgboost.roc_auc.toFixed(2)} (n+={m.susceptibility.holdout_test.xgboost.n_pos})</td></tr>
                  <tr><td>Later-documented localities</td><td className="num text-right">{m.susceptibility.spatiotemporal.all_later_localities.roc_auc.toFixed(2)}</td></tr>
                  <tr><td>Event-day model · LOSO CV</td><td className="num text-right">{m.dynamic.product_comparison.results.imd_gauge.logistic_loyo.roc_auc.toFixed(2)} (IMD)</td></tr>
                  <tr><td>24 h information cut-off</td><td className="num text-right text-orange">{m.dynamic.lead_time['24h'].roc_auc.toFixed(2)}</td></tr>
                  <tr><td>Hourly flood forecasting</td><td className="text-right text-orange">not supported by data</td></tr>
                </tbody>
              </table>
            </Panel>
          </div>
        )}
      </Section>

      <Section kicker="What we found" title="Key results — with their caveats">
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout>
            <b>Satellite radar cannot see Kolkata's street waterlogging.</b> Across 258 Sentinel-1 image pairs, newly detected open water in
            built-up cells averaged 0.003% and was slightly <em>anti</em>-correlated with rainfall. SAR was therefore rejected as a label source and is used only as a
            background feature.
          </Callout>
          <Callout>
            <b>A pure terrain index fails; learned models rank documented localities well.</b> A HAND/TWI/depression index scores below chance
            (ROC-AUC 0.40), while models combining surface-model texture, drainage proximity and land cover reach 0.84–0.90 under spatial
            cross-validation. Surface-model "terrain" partly encodes building form — see Research.
          </Callout>
          <Callout>
            <b>Rainfall products are statistically indistinguishable for event days.</b> IMD gauge grids, CHIRPS (satellite) and ERA5 (reanalysis) all
            discriminate documented waterlogging days with ROC-AUC 0.88–0.91 and overlapping confidence intervals.
          </Callout>
          <Callout tone="warn">
            <b>Skill is a same-day phenomenon.</b> Withholding the last 24 h of rainfall drops discrimination to ROC-AUC 0.57; at 48 h it is below chance.
            Operational warnings would require rainfall forecasts, which we display only as rainfall — never as flood forecasts.
          </Callout>
        </div>
      </Section>

      {quality.data?.feasibility && (
        <Section kicker="Why Kolkata first" title="Evidence-based pilot selection">
          <Panel>
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-3">
                {Object.entries(quality.data.feasibility.weighted_totals_base).map(([c, v]) => <Stat key={c} label={c} value={v.toFixed(2)} sub="weighted score / 10" />)}
              </div>
              <p className="text-[13.5px] leading-relaxed text-slate">{quality.data.feasibility.decision} <Link to="/observatory">Full scoring and sensitivity →</Link></p>
            </div>
          </Panel>
        </Section>
      )}

      <Section kicker="Multi-city architecture" title="City registry">
        {cities.data ? (
          <div className="overflow-x-auto border border-line bg-white">
            <table className="data">
              <thead><tr><th>City</th><th>State</th><th>Status</th><th>Outputs</th></tr></thead>
              <tbody>
                {cities.data.cities.map((c) => (
                  <tr key={c.id}><td className="font-medium">{c.name}</td><td>{c.state}</td><td><span style={{ color: STATUS_STYLE[c.status].color }}>●</span> {STATUS_STYLE[c.status].label}</td><td>{c.has_outputs ? 'available' : '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-paper-2 px-3 py-2 text-[11.5px] text-mute">Models are city-specific. No model trained for Kolkata is applied to another city without an independent cross-city test.</div>
          </div>
        ) : <Loading />}
      </Section>
    </div>
  )
}
