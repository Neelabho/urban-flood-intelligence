# Research gap analysis

Derived from the retrieved literature ([`literature_review.md`](literature_review.md)) and from what the data in this
project could and could not support. Gaps are stated as observations about the *retrieved* corpus (95 records), not
claims about the entire field.

| # | Gap | Evidence from literature | Evidence from this project | How UFII addresses it | Status |
|---|---|---|---|---|---|
| G1 | **Label provenance & reporting bias** in urban flood inventories | Inventories are used as given; Zhao et al. 2018 and Ren et al. 2024 acknowledge incompleteness, but abstracts do not model *where* reports come from | Documented localities cluster in the dense core and along arterials | Source-cited inventory (URL, publication time, date basis per row); target-group background restricted to urban cells (Phillips et al. 2009); buffer for geocoding error; results framed as relative | Implemented; residual bias acknowledged |
| G2 | **Spatial and temporal validation** rarely used in urban susceptibility | Roberts et al.; Ploton et al. 2020 show random CV inflates skill; few urban flood abstracts report blocked CV | Random CV overstates PR-AUC by ~50% relative to 2 km block CV here | Block CV, untouched test blocks, spatio-temporal test on later-documented localities | Implemented |
| G3 | **Untested assumption that satellites see urban flooding** | Li et al. 2019 and Mason et al. 2014 note urban SAR difficulty | 258 Sentinel-1 pairs: no rainfall-driven open-water signal in built-up cells (ρ ≈ −0.21) | Explicit label-feasibility test; SAR demoted to a feature | Implemented (negative result) |
| G4 | **DSM artefacts in urban terrain predictors** | HAND/TWI widely used; DEM accuracy studies (Wessel et al. 2018) focus on absolute error | Terrain-only index scores below chance; DSM slope/elevation-SD dominate SHAP | Ablations and interpretation as urban-form proxies; recommendation for bare-earth DEM | Diagnosed; bare-earth DEM not available openly under a compatible licence in this run |
| G5 | **Event-level rainfall-trigger validation for Indian cities** | DL forecasting relies on dense discharge series (Kratzert et al.); Guptha et al. 2021 note sub-hourly rainfall scarcity | No public hourly waterlogging record; 24 documented event days 2016–2026 | City-scale event-day discrimination with leave-one-season-out CV; lead-time cut-off experiment | Implemented; small sample |
| G6 | **Satellite vs gauge rainfall for urban event detection** | IMERG/CHIRPS evaluations focus on rainfall error, not flood-event skill | CHIRPS misses the 22–23 Sep 2025 extreme | Product comparison on identical days (IMD, CHIRPS, ERA5) | Implemented; IMERG limited to case studies |
| G7 | **Uncertainty communicated separately from risk** | Probabilistic mapping is emerging (Krishnachaithanya et al. 2025) | Bootstrap spread varies strongly across the city | Ensemble spread layer, extrapolation and imputation flags | Implemented |
| G8 | **Cross-city transferability** | Multi-city ML frameworks exist; independent transfer tests rarely reported in abstracts | Mumbai assessed but not modelled in this run | Registry prevents untested reuse; Mumbai recommended next | Not yet tested |

## Gaps that remain open (and why)

* **Drainage capacity.** Kolkata's sewer/storm-drain and pumping-station data are not public; OSM maps only open drains and canals.
* **Observed flood extent/depth.** No mapped extents exist for the documented events; crowdsourced depth reports or municipal sensor data (KMC reports sensors at 50 locations) would enable regression on depth.
* **Hourly labels.** Without time-stamped waterlogging observations, 1–6 h forecasting cannot be validated.
