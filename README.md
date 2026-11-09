# Urban Flood Intelligence India (UFII)

An AI-powered geospatial platform for urban flood susceptibility, rainfall-conditioned risk, environmental intelligence
and uncertainty-aware analysis across Indian cities, **piloted in Kolkata**.

UFII integrates 12 public datasets (Sentinel-1 SAR, Copernicus DEM, ESA WorldCover, JRC surface water, GHS-POP,
OpenStreetMap, IMD, CHIRPS, ERA5, GPM IMERG, the India Flood Inventory) with a **source-cited inventory of documented
waterlogging** to (A) rank 250 m cells by relative waterlogging susceptibility, (B) test how rainfall discriminates
documented event days, and (C) measure how that skill decays with lead time — and it shows every source, uncertainty and
limitation in an interactive web application.

> Research prototype. Not an official warning service.

## What it found (Kolkata, 2016–2026)

| Question | Result |
|---|---|
| Can Sentinel-1 radar label urban waterlogging? | **No.** 258 image pairs show no rainfall-driven new open water in built-up cells (Spearman ρ = −0.21). SAR is used only as a feature. |
| How well can documented waterlogging locations be ranked? | Spatial (2 km block) CV ROC-AUC 0.84–0.90; held-out blocks 0.86 [0.63–0.97]; localities first reported in 2025–26: 0.88. A bare-terrain index scores 0.40 (below chance). |
| Does satellite rainfall beat gauges for event days? | **No detectable difference**: IMD 0.91, CHIRPS 0.88, ERA5 0.89 (overlapping CIs; 16 events). |
| How far ahead does rainfall information help? | ROC-AUC ≈ 0.74 with ≤ 6 h cut-off; 0.57 [0.43–0.79] at 24 h — waterlogging is a same-day phenomenon. Hourly flood forecasting is **not** supported by available data. |
| Where are the gaps? | Southern "added areas" (Sarsuna, Behala, Joka) and Salt Lake are under-predicted; no drainage-network data exist publicly. |

Full numbers: [`reports/technical_report.md`](reports/technical_report.md). Every value traces to `experiments/*.json`.

## The application

Ten pages (React + TypeScript + Vite + Tailwind, MapLibre GL, ECharts):

* **Overview** — India city registry map, data coverage, validation status, key findings, pilot-selection evidence.
* **Flood Intelligence** — 250 m map with 18 layers (susceptibility, uncertainty, coverage/extrapolation, terrain, hydrology, urban fabric, exposure), opacity, legend, search (documented localities + OSM Nominatim), event timeline, and a click panel with model output, ensemble interval, SHAP contributions, input variables tagged *observed / derived / modelled / imputed*, and cited observations.
* **Live Conditions** — live Open-Meteo rainfall (past/next 72 h) with an experimental event-day likelihood, clearly labelled as a rainfall forecast.
* **Forecasting** — daily rainfall from IMD/CHIRPS/ERA5 with documented events, product comparison, lead-time decay, validated-horizon table, scenario tool.
* **Historical Events** — 94 events (1975–2026) with filters, search, sources, rainfall context, hourly ERA5/IMERG, Sentinel-1 acquisitions.
* **Exposure** — population, buildings, roads and facilities by susceptibility class (potential exposure only).
* **Research & Models** — model comparison with CIs, ROC/PR, calibration, confusion matrix, spatial vs random CV, ablation, SHAP, PDP, tuning grid, experiment registry.
* **Data Observatory** — catalogue, provenance, missingness, imputation evaluation, SAR label test, rainfall QA, feasibility scoring, download manifest.
* **Methodology / About.**

## Quick start

```bash
# Python 3.12
uv venv --python 3.12 .venv && uv pip install -r requirements.txt --python .venv/bin/python
uv pip install -e . --python .venv/bin/python
brew install libomp            # macOS, for XGBoost/LightGBM

# Web app (static research build; data bundle is committed)
cd frontend && npm ci && npm run dev        # http://localhost:5173

# API (Mode B)
.venv/bin/uvicorn backend.app.main:app --port 8000   # http://localhost:8000/docs

# Tests
.venv/bin/python -m pytest -q
```

Reproduce the research pipeline (downloads ~2 GB, ~1 h; modelling ~4 min):

```bash
scripts/run_pipeline.sh kolkata                 # or: --skip-download
```

## Repository layout

```
src/flood_intelligence/   ingestion · preprocessing · features · models · evaluation · inference (pipeline package)
backend/app/              FastAPI service (Mode B)
frontend/                 React application; public/data = exported static bundle (Mode A)
config/cities.yaml        multi-city registry
data/metadata/            download manifest, dataset catalogue, source registry, data-quality report
data/raw/flood_observations/kolkata/   source-cited documented waterlogging inventory (committed)
experiments/              one JSON record per experiment
research/                 literature review, gaps, RQs, methodology, proposal, feasibility assessment
reports/                  technical report, paper outline
docs/                     architecture, deployment, reproducibility, open-source dependencies
tests/                    data, geospatial, ML and API tests
```

Raw/interim/processed data and model binaries are **not** committed; scripts regenerate them.

### Where to find the machine learning and the data on GitHub

| What | Where |
|---|---|
| Susceptibility models (LR, tree, RF, XGBoost, LightGBM, SVM, baselines, validation, SHAP, uncertainty) | [`src/flood_intelligence/models/susceptibility.py`](src/flood_intelligence/models/susceptibility.py) |
| PyTorch MLP comparator | [`src/flood_intelligence/models/deep_tabular.py`](src/flood_intelligence/models/deep_tabular.py) |
| Event-day rainfall model and lead-time experiment | [`src/flood_intelligence/models/dynamic.py`](src/flood_intelligence/models/dynamic.py) |
| Feature engineering and labels/splits | [`src/flood_intelligence/features/`](src/flood_intelligence/features/) |
| Imputation study, SAR water detection | [`src/flood_intelligence/preprocessing/`](src/flood_intelligence/preprocessing/) |
| Metrics and bootstrap CIs | [`src/flood_intelligence/evaluation/metrics.py`](src/flood_intelligence/evaluation/metrics.py) |
| Every experiment's settings and results | [`experiments/`](experiments/) |
| Data download code (one module per source) | [`src/flood_intelligence/ingestion/`](src/flood_intelligence/ingestion/) |
| Dataset catalogue, download log, quality report | [`data/metadata/`](data/metadata/) |
| Documented waterlogging reports (our compiled labels) | [`data/raw/flood_observations/kolkata/`](data/raw/flood_observations/kolkata/) |
| Results used by the website | [`frontend/public/data/kolkata/`](frontend/public/data/kolkata/) |
| **Trained model file and processed datasets** | [Release v0.1.0](https://github.com/Neelabho/urban-flood-intelligence/releases/tag/v0.1.0) (`.joblib` model, bootstrap ensemble, processed Parquet tables, experiment records) |

The raw downloads (~1.8 GB of satellite images, rainfall grids and map extracts) are not stored on GitHub: they are too
large, several licences do not allow redistribution, and `scripts/run_pipeline.sh` re-downloads them from the original
providers.

## Publishing the website

The site is a static build (`npm run build` in `frontend/`) with clean page addresses, per-page titles and
descriptions, a sitemap and robots.txt, so it can be hosted anywhere and indexed by search engines. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the step-by-step guide, including Google Search Console.

Developed by **Neelabho Chakraborty**.

## Claims and non-claims

**Can be claimed:** the measured results above for Kolkata under the stated designs; the SAR negative result for this
area and sensor; the importance of spatial validation here.
**Cannot be claimed:** absolute flood probabilities; causal effects of features; transfer to other cities; operational
forecasting skill; completeness of the observation inventory.

## Data credits and licences

Code: MIT ([LICENSE](LICENSE)). Data remain under their providers' terms — see
[`data/metadata/dataset_catalog.json`](data/metadata/dataset_catalog.json) and
[`docs/OPEN_SOURCE_DEPENDENCIES.md`](docs/OPEN_SOURCE_DEPENDENCIES.md). The India Flood Inventory is CC BY-NC 4.0 and is
not redistributed. Map data © OpenStreetMap contributors (ODbL).
