# Open-source dependencies

UFII integrates established tools rather than re-implementing them. Versions are pinned loosely in `requirements.txt`
and `frontend/package.json` (exact versions in `frontend/package-lock.json`).

| Component | Licence | Used for | Why chosen / alternatives considered |
|---|---|---|---|
| NumPy, pandas, SciPy, PyArrow | BSD / Apache-2.0 | arrays, tables, distance transforms, Parquet | standard |
| GeoPandas, Shapely 2, pyproj | BSD-3 / BSD-3 / MIT | vector processing, CRS transforms | standard |
| rasterio (GDAL) | BSD-3 (GDAL: MIT/X) | raster I/O, windowed COG reads, reprojection, rasterisation | standard; avoids custom raster code |
| xarray, zarr, adlfs | Apache-2.0 / MIT / BSD | gridded rainfall, IMERG Zarr access | — |
| pysheds | **GPL-3.0** | D8 routing, depression filling, HAND | maintained, pure-Python; used as an unmodified library and not redistributed. WhiteboxTools (MIT) is a drop-in alternative if GPL is a concern. A compatibility shim restores `np.in1d` (removed in NumPy 2.4) at import time. |
| pystac-client, planetary-computer | Apache-2.0 / MIT | STAC search and anonymous SAS signing (Sentinel-1, DEM, WorldCover, JRC, IMERG) | avoids credentials |
| scikit-image | BSD-3 | Otsu threshold | — |
| scikit-learn | BSD-3 | models, grouped CV, KNN/iterative imputation, PDP | — |
| XGBoost, LightGBM | Apache-2.0 / MIT | gradient boosting | needs `libomp` on macOS (`brew install libomp`) |
| PyTorch | BSD-3 | MLP comparator | runs in a separate process: PyTorch and XGBoost/LightGBM bundle different OpenMP runtimes that segfault together on macOS |
| SHAP | MIT | TreeSHAP global/local explanations | — |
| FastAPI, Uvicorn, httpx, Pydantic | MIT / BSD-3 | API (Mode B) | modular monolith, no extra infrastructure |
| pytest, Ruff | MIT | tests, lint | — |
| React, React Router, Vite, TypeScript | MIT / Apache-2.0 | web application | — |
| Tailwind CSS 4 | MIT | styling | — |
| MapLibre GL JS 5 | BSD-3 | interactive maps | open fork of Mapbox GL; no token |
| OpenFreeMap (tiles), OpenMapTiles schema | free service; OSM data ODbL | basemap | no API key; fallback to OSM raster tiles |
| Apache ECharts 5 | Apache-2.0 | charts | tree-shaken core build |

**Evaluated but not adopted:** LISFLOOD-FP / HEC-RAS (no drainage network, culvert or boundary-condition data — a
hydrodynamic model would be unconstrained); deck.gl (MapLibre fill layers suffice for 17k cells); MLflow (a JSON
experiment registry is enough at this scale); PostGIS (static GeoParquet/JSON outputs; no multi-user writes);
TiTiler/GeoServer (no raster tiles served); Kepler.gl (less control over provenance labels).

**Data services** (not software): Microsoft Planetary Computer, Overpass API, OSM Nominatim (usage policy respected:
1 req/s, identifying User-Agent), Open-Meteo (archive and forecast APIs, CC BY 4.0), IMD Pune, UCSB-CHC, JRC GHSL, Zenodo,
OpenAlex and Semantic Scholar (literature metadata).
