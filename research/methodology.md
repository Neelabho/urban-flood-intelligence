# Methodology

Code references are to `src/flood_intelligence/`. Every stage is executed by `scripts/run_pipeline.sh`.

## 1. Study area and grid

* Study area: 88.20–88.50° E, 22.40–22.70° N (Kolkata Municipal Corporation and adjoining municipalities, incl. Howrah,
  Salt Lake, New Town). A documented bounding box is used because no ward boundaries were used.
* Grid: WGS 84 / UTM 45N (EPSG:32645), 250 m cells aligned to multiples of 250 m; 125 × 135 = 16,875 cells
  (`config.make_grid`). A 25 m sub-grid (×10) is used for SAR, distances and land-cover aggregation.
* Rationale for 250 m: commensurate with geocoding uncertainty of report localities (median ~100 m, up to 2 km) and
  with 30 m DEM / 20 m SAR inputs after aggregation.

## 2. Data acquisition (`ingestion/`)

| Dataset | Module | Notes |
|---|---|---|
| Sentinel-1 RTC (VV, VH), May–Nov 2017–2025 | `sentinel1.py` | 472 date×orbit acquisitions; frames mosaicked; 20 m overview averaged onto the 25 m grid; int16 dB×100 |
| Copernicus GLO-30 DSM | `static_layers.py` | mosaicked, bilinear to 30 m UTM |
| ESA WorldCover 2021 v200 | `static_layers.py` | nearest to 10 m UTM |
| JRC GSW v1.4 occurrence/seasonality | `static_layers.py` | nearest to 30 m UTM |
| GHS-POP R2023A 2020 (3″) | `static_layers.py` | windowed read from zipped tile (WorldPop rejected range reads) |
| OSM buildings (centroids), roads, waterways, water bodies, facilities | `osm.py` | Overpass, 3×3 tiling for buildings |
| IMD 0.25° daily 2016–2025 | `rainfall.py` | binary .grd; orientation verified against land mask |
| CHIRPS v2.0 daily (May–Oct 2016–2026) | `rainfall.py` | windowed COG reads; 138 days unavailable (HTTP 403) |
| ERA5 hourly precipitation 2016-01..2026-10 | `rainfall.py` | Open-Meteo archive, 9 nodes |
| GPM IMERG V06 half-hourly | `rainfall.py` | 8 event windows only (anonymous mirror: 311 MB global chunks, ends 2021-05) |
| Documented waterlogging reports | `data/raw/flood_observations/kolkata/*.csv` | compiled by hand from cited articles |
| India Flood Inventory v3 | downloaded from Zenodo | Kolkata-district events |

Each artefact is recorded in `data/metadata/download_manifest.json` (source URL, UTC time, bytes, SHA-256).

## 3. Observation inventory

1. Systematic web searches for Kolkata waterlogging reports by year; article text retrieved with `curl` where the
   publisher allowed automated access (Millennium Post, Deccan Herald; The Telegraph and The Statesman blocked access).
2. For each article: publication time (from page metadata), event date (from weekday/date wording, recorded in
   `date_basis`), and every locality the article explicitly says was waterlogged/inundated. No quotations beyond names.
3. Geocoding with OSM Nominatim (bounded to the study area), manual audit: 4 wrong matches rejected, a project-OSM name
   match used for 12 names Nominatim mishandled, 6 unresolved. Positional uncertainty is recorded per locality.
4. City-level reports (no localities) and IFI Kolkata entries provide additional event dates.

## 4. SAR label-feasibility test (`preprocessing/sar_water.py`)

Bounded Otsu thresholds on VV and VH; same-orbit pairs ≤ 24 days (≤ 12 days for the feasibility test); new water =
water now, not before, VV drop > 3 dB, not JRC permanent water (occurrence ≥ 75%). New-water fractions by WorldCover
class correlated with IMD 3-day rainfall. **Outcome:** built-up mean new-water fraction 0.003%, Spearman ρ = −0.21 with
rainfall; Otsu never fell inside physical bounds. SAR rejected as a label source; retained as features (water occurrence
VV < −18 dB & VH < −24 dB; mean and temporal SD of VV).

## 5. Features (`features/static_features.py`)

* **Terrain (DSM):** mean/min/SD elevation, slope, relative elevation (1 km, 2 km windows), depression depth and
  fraction > 0.5 m, D8 flow accumulation, HAND, TWI. pysheds with OSM waterways and JRC permanent water burned 3 m into
  the DSM; channels = accumulation > 1,000 cells (~0.9 km²) or burned features.
* **Hydrology:** distances to OSM waterways, canals/drains, the Hooghly, permanent water; canal/drain density; OSM
  water-body fraction; JRC occurrence; SAR water occurrence.
* **Urban fabric:** WorldCover fractions (tree, grass, crop, built, bare, water, wetland), OSM road density, SAR VV
  statistics.
* **Exposure (not used as hazard predictors):** population, OSM buildings, facilities.
* Excluded from the model: coordinates (would learn reporting geography), OSM building counts (mapping-campaign
  artefacts), population.

## 6. Missing data (`preprocessing/imputation.py`)

HAND is undefined for 5.1% of cells (D8 paths not reaching a channel). Missingness is spatially clustered (97% of missing
cells have a missing neighbour vs 19% expected at random) and differs in terrain covariates (KS tests) → not MCAR,
plausibly MAR. Mean, median, KNN (k = 8), iterative Bayesian ridge and iterative extra-trees were scored by masking 10%
of known values (random and 1 km spatial blocks; 3 seeds). KNN was best (RMSE 1.04 m vs 2.03 m for mean imputation,
spatial-block masks). The imputer is part of the sklearn pipeline (refitted per fold) with a missingness indicator.
Labels and rainfall are never imputed.

## 7. Module A — susceptibility (`features/labels.py`, `models/susceptibility.py`)

* Positive: cell containing ≥ 1 geocoded documented locality (75 cells).
* Background: urban cells (WorldCover built-up ≥ 25%, not permanent water) more than 2 cells (Chebyshev) from any
  positive (6,521 cells). Excluded: buffer ring (1,156), non-urban cells (9,123). This is a target-group background
  (Phillips et al. 2009).
* Splits: 2 km blocks; 20% of blocks (stratified on positives; seed 42) form an untouched test set (16 positives /
  1,383 cells). Temporal split: localities first documented 2016–2024 (31 cells) vs 2025–2026 (44 cells).
* Models: logistic regression, decision tree, random forest, XGBoost, LightGBM, RBF-SVM (all class-weighted), PyTorch
  MLP (separate process), non-learned baselines (terrain index, built-up fraction, road density).
* Validation: StratifiedGroupKFold(5) on blocks within the training split; random 5-fold for comparison; cluster
  (block) bootstrap CIs; held-out test with a threshold frozen from training OOF predictions; spatio-temporal test.
* Tuning: XGBoost depth {2,3,4} × trees {200,400} on spatial CV (training split only).
* Final model: XGBoost (depth 4, 200 trees) refitted on all labelled cells; 30 block-bootstrap members provide
  per-cell percentile spread; outputs are percentile ranks and quantile classes (very low < 50, low 50–75, moderate
  75–90, high 90–97, very high ≥ 97).
* Explainability: TreeSHAP (global mean |SHAP| on urban cells, per-cell top-3), partial dependence, group ablations.

## 8. Module B/C — event days and lead time (`models/dynamic.py`)

* Days: May–Oct 2016–2026 (1,955 days after excluding days −1/+1/+2 around events). Labels: 24 documented event days.
* Features per IST calendar day D: IMD max-cell and mean over IMD days D and D+1 (08:30 IST convention), 3-day
  antecedent; CHIRPS UTC days D−1 and D; ERA5 (max of 9 nodes) 24 h/48 h totals, max 1/3/6 h intensities, 72 h antecedent.
* Validation: leave-one-season-out; year-cluster bootstrap. Product comparison on the common period 2016-05..2025-10
  (1,752 days, 16 events).
* Lead-time experiment: ERA5 features recomputed with information cut off h ∈ {0, 3, 6, 12, 24, 48} hours before the end
  of day D.
* Scenario curve and live inference: unweighted logistic regression (probability that a day appears in the documented
  record — a lower bound given under-reporting).

## 9. Exposure

Sums of modelled population, OSM buildings, road length and facility counts per susceptibility class. Reported as
potential exposure only.

## 10. Reproducibility

Fixed seeds (42), deterministic folds, experiment JSON records with git commit, dataset SHA-256 versions, and a single
pipeline script. Lightweight configuration: the full modelling stage runs in ~4 minutes on an Apple-silicon laptop CPU.
