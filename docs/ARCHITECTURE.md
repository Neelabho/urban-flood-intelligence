# Architecture

A modular monolith: one Python package for the research pipeline, a thin FastAPI service, and a static React site.

```mermaid
flowchart LR
  subgraph Sources["Public sources"]
    PC[Planetary Computer<br/>Sentinel-1 RTC, GLO-30, WorldCover, JRC GSW, IMERG]
    OSM[OSM Overpass / Nominatim]
    IMD[IMD gridded rainfall]
    CH[CHIRPS COGs]
    OM[Open-Meteo ERA5 archive]
    GH[GHS-POP]
    NEWS[Cited news reports<br/>India Flood Inventory]
  end
  subgraph Pipeline["src/flood_intelligence (Python)"]
    ING[ingestion/*<br/>+ download manifest]
    PRE[preprocessing/<br/>sar_water, imputation]
    FEAT[features/<br/>static_features, labels]
    MOD[models/<br/>susceptibility, deep_tabular, dynamic]
    EXP[inference/export]
  end
  subgraph Out["Outputs"]
    PROC[(data/processed<br/>Parquet + JSON)]
    EXPS[(experiments/*.json)]
    MODELS[(models/*.joblib)]
    BUNDLE[(frontend/public/data<br/>static JSON bundle)]
  end
  Sources --> ING --> PRE --> FEAT --> MOD --> PROC
  MOD --> EXPS
  MOD --> MODELS
  PROC --> EXP --> BUNDLE
  BUNDLE --> WEB[React + MapLibre + ECharts<br/>Mode A: static]
  BUNDLE --> API[FastAPI<br/>Mode B]
  MODELS --> API
  OMF[Open-Meteo forecast] --> API
  OMF --> WEB
  API -. optional .-> WEB
```

```mermaid
flowchart TB
  A[Documented reports] --> G[Geocode + audit] --> P[Positive cells]
  U[Urban cells built-up ≥ 25%] --> B[Background = urban minus 500 m buffer]
  P & B --> S[2 km blocks → train / untouched test]
  S --> CV[Grouped 5-fold CV → model choice, threshold]
  CV --> T[Held-out test, spatio-temporal test]
  CV --> F[Final XGBoost + 30 bootstrap members]
  F --> M[Percentile map, spread, SHAP]
```

**Operating modes.** *Mode A* (default, GitHub Pages): all pages read precomputed JSON with generation timestamps; the
Live page calls Open-Meteo directly from the browser and evaluates the exported logistic model client-side. *Mode B*:
when `VITE_API_BASE` points to a running API, the cell panel requests a fresh TreeSHAP decomposition, and
`/api/flood/risk` and `/api/flood/forecast` provide server-side inference. If the API is unreachable the UI says so and
falls back to Mode A.

**City registry.** `config/cities.yaml` drives every stage (bbox, UTM zone, status). Adding a city = registry entry +
observation inventory + `scripts/run_pipeline.sh <city>`. A city appears as selectable only when its outputs exist.
