import { Callout, Kind, PageHeader, Section } from '../components/ui'

const STEPS: [string, string, string[]][] = [
  ['Data acquisition', 'Scripted, logged downloads of public data', ['Sentinel-1 RTC (472 acquisitions)', 'Copernicus GLO-30, WorldCover, JRC GSW, GHS-POP', 'OSM via Overpass', 'IMD, CHIRPS, ERA5, IMERG windows', 'Cited waterlogging reports, India Flood Inventory']],
  ['Quality control', 'Measured, not assumed', ['Rainfall cross-product checks', 'SAR coverage per acquisition', 'Geocode audit (3 rejected, 6 unresolved)', 'Missingness mechanism tests']],
  ['Spatial processing', 'One metric grid for everything', ['UTM 45N, 250 m cells (16,875)', 'Average/min/sum resampling by variable', 'Stream-burned D8 routing (pysheds)', '25 m sub-grid for SAR & distances']],
  ['Feature engineering', 'Hazard and exposure kept apart', ['Terrain (DSM): elevation, slope, HAND, TWI, depressions', 'Hydrology: distances, water bodies, SAR water', 'Urban fabric: land cover, roads', 'Exposure: population, buildings, facilities']],
  ['Model development', 'Simple first, complex only if justified', ['LR, tree, RF, XGBoost, LightGBM, SVM, MLP', 'Terrain index and built-up baselines', 'Event-day logistic / boosted models']],
  ['Validation', 'Leakage-aware', ['2 km block CV; untouched test blocks', 'Later-documented localities', 'Leave-one-season-out for event days', 'Cluster-bootstrap CIs']],
  ['Prediction', 'Relative, with uncertainty', ['Percentiles and quantile classes', '30-member block bootstrap', 'Extrapolation and imputation flags']],
  ['Interpretation', 'Explain without over-claiming', ['TreeSHAP global/local', 'Partial dependence', 'Ablations', 'No causal claims']],
]

export default function Methodology() {
  return (
    <div>
      <PageHeader eyebrow="Methodology" title="From public data to a defensible susceptibility estimate">
        The scientific pipeline, the definitions that keep different kinds of numbers apart, and the decisions forced by the data.
      </PageHeader>
      <Section kicker="Pipeline" title="Eight stages">
        <div className="grid gap-0 overflow-hidden border border-line bg-white sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, s, items], i) => (
            <div key={t} className="relative border-b border-r border-paper-2 p-4">
              <div className="num text-[11px] text-amber">{String(i + 1).padStart(2, '0')}</div>
              <div className="h-serif text-[16px] font-semibold">{t}</div>
              <div className="text-[12px] text-mute">{s}</div>
              <ul className="mt-2 list-disc pl-4 text-[12.5px] leading-snug text-slate">{items.map((x) => <li key={x}>{x}</li>)}</ul>
              {i < STEPS.length - 1 && <div className="absolute right-2 top-4 text-mute">→</div>}
            </div>
          ))}
        </div>
      </Section>
      <Section kicker="Definitions" title="Six concepts that are never interchangeable">
        <div className="overflow-x-auto border border-line bg-white">
          <table className="data">
            <thead><tr><th>Concept</th><th>What it is here</th><th>What it is not</th></tr></thead>
            <tbody>
              <tr><td><Kind k="model" /> Static susceptibility</td><td>Relative ranking of 250 m cells by similarity to cells with documented waterlogging, from time-invariant features.</td><td>A probability that a cell floods in a given storm; a forecast.</td></tr>
              <tr><td><Kind k="model" /> Dynamic risk</td><td>City-scale probability that a day enters the documented waterlogging record, given rainfall.</td><td>A spatially resolved, validated real-time flood map.</td></tr>
              <tr><td><Kind k="forecast" /> Forecasting</td><td>Information cut-off experiments; live rainfall forecasts shown as rainfall.</td><td>A validated 1–24 h flood forecast (no hourly labels exist).</td></tr>
              <tr><td><Kind k="reported" /> Observed events</td><td>Dated, cited reports and inventory entries; geocoded locality mentions.</td><td>Mapped flood extents or depths.</td></tr>
              <tr><td><Kind k="modelled" /> Exposure</td><td>Population (modelled), buildings, roads and facilities in susceptibility classes.</td><td>Observed affected population or damage.</td></tr>
              <tr><td><Kind k="simulated" /> Scenarios</td><td>Hypothetical rainfall passed through the event-day model.</td><td>Anything that happened.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section kicker="Labels" title="Why documented reports, not satellite flood maps">
        <div className="prose-ufii max-w-4xl text-[14px] text-slate">
          <p>The original plan derived inundation labels from Sentinel-1 change detection (after Twele et al. 2016; Clement et al. 2018). We built that pipeline (472 acquisitions,
            per-orbit pairs, Otsu thresholds bounded to physical ranges, JRC permanent-water mask) and tested it before using it. In built-up cells newly detected open water was
            essentially zero and slightly anti-correlated with rainfall; Otsu thresholds never fell inside physical bounds because water is a tiny share of the scene; and
            post-cyclone changes reflected tree damage, not standing water. This is consistent with known C-band limitations in dense urban areas (Mason et al. 2014) and with
            Kolkata's waterlogging typically draining within hours — far shorter than the 6–12 day revisit.</p>
          <p>Labels therefore come from <b>documented waterlogging reports</b>: 132 locality mentions across 14 dated events (2021–2026) from accessible news archives, each row
            carrying its URL, publication time and date basis, geocoded with OSM Nominatim and audited by hand. City-level reports and India Flood Inventory entries add event
            dates for the temporal model.</p>
          <h3>Presence/background design and reporting bias</h3>
          <p>Because absence of a report is not absence of flooding, unlabelled cells are treated as <i>background</i>, not negatives. Background is restricted to urban cells
            (built-up ≥ 25%) — a target-group background that mirrors where reports can occur — and a 500 m ring around each positive is excluded to absorb geocoding error.
            Scores are interpreted as relative rankings.</p>
          <h3>Validation</h3>
          <p>Grouped 5-fold cross-validation on 2 km blocks within a training split; 20% of blocks (16 positives) never touched during model selection; a spatio-temporal test on
            localities first documented in 2025–2026; random CV reported only to quantify leakage optimism. Event-day models use leave-one-season-out CV with year-cluster
            bootstrap intervals.</p>
          <h3>Imputation</h3>
          <p>Only static features are imputed (HAND where D8 paths never reach a channel, 5% of cells). Candidates were scored by hiding known values (random and spatially
            blocked); KNN halved the RMSE of mean imputation. Imputers sit inside the modelling pipeline and are refitted per fold; a missingness indicator is retained. Labels
            and rainfall are never imputed.</p>
          <h3>Uncertainty</h3>
          <p>Per-cell uncertainty is the spread of percentile ranks across 30 models fitted on block-bootstrap resamples, plus explicit flags for extrapolation (non-urban cells)
            and imputed inputs. Confidence and susceptibility are shown as separate layers.</p>
          <h3>Why no deep spatiotemporal model</h3>
          <p>ConvLSTM, graph networks and transformers need many labelled space-time samples. With 75 positive cells and 24 event days, they would memorise noise. A small MLP is
            reported as an "advanced" comparator on identical folds; it does not outperform tree ensembles.</p>
        </div>
      </Section>
      <Section kicker="Geospatial" title="Grid and coordinate reference">
        <Callout>All rasters and vectors are reprojected to WGS 84 / UTM zone 45N (EPSG:32645). Cells are 250 m squares aligned to multiples of 250 m (origin 623 250 E, 2 511 250 N;
          125 × 135 cells). Distances are Euclidean in metres on a 25 m sub-grid. No administrative boundaries are invented: the study area is a documented bounding box
          (88.20–88.50° E, 22.40–22.70° N) covering KMC and adjoining municipalities, because ward boundaries were not used.</Callout>
      </Section>
    </div>
  )
}
