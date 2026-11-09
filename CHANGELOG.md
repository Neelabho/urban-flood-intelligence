# Changelog

## 0.1.0 — 2026-11-09

Initial research release (Kolkata pilot).

### Added
- City registry, 250 m UTM analysis grid, download manifest and dataset catalogue.
- Acquisition: Sentinel-1 RTC (472 acquisitions), Copernicus GLO-30, ESA WorldCover, JRC GSW, GHS-POP, OSM, IMD, CHIRPS, ERA5, IMERG event windows, India Flood Inventory.
- Source-cited documented-waterlogging inventory (132 locality mentions, 14 dated events) with audited geocoding.
- SAR water detection and label-feasibility test (negative result).
- Static features (terrain/hydrology/urban/exposure), missingness analysis and evaluated KNN imputation.
- Susceptibility experiments: 6 classical models, PyTorch MLP, non-learned baselines, spatial/random/held-out/spatio-temporal validation, ablations, bootstrap uncertainty, SHAP, PDP.
- Event-day models, rainfall-product comparison and lead-time experiment.
- FastAPI backend with 12 endpoints; static JSON export.
- React/MapLibre/ECharts web application (10 pages); live Open-Meteo rainfall.
- Tests (31), CI and manual-dispatch Pages workflows, research and technical documentation.

### Changed during the run
- Labels switched from Sentinel-1 change detection to documented reports after the SAR feasibility test.
- Population source switched from WorldPop to GHS-POP (WorldPop server rejected range reads).
- IMERG restricted to case studies (anonymous mirror uses 311 MB global chunks); CHIRPS added as satellite product.
- PyTorch comparator moved to its own process (OpenMP conflict with XGBoost/LightGBM on macOS).
