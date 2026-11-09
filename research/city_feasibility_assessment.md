# Pilot-city feasibility assessment: Kolkata vs Mumbai

Machine-readable versions: [`city_feasibility_assessment.json`](city_feasibility_assessment.json) (scores, weights,
sensitivity) and [`city_feasibility_evidence.json`](city_feasibility_evidence.json) (raw measurements produced by
`scripts/feasibility/probe_city_data.py`). All counts below were **measured during this run** (9 Nov 2026); none are
hand-entered.

## Measured evidence

| Evidence | Kolkata | Mumbai | Source |
|---|---:|---:|---|
| Sentinel-1 RTC monsoon (Jun–Oct) acquisitions 2017–2025 | **523** (3 orbits) | 115 (1 orbit) | Planetary Computer STAC |
| Copernicus GLO-30 relief, p95−p5 | 10.1 m | **130.2 m** | GLO-30 tiles |
| OSM building ways in study bbox | **498,494** | 116,716 | Overpass |
| OSM drain/ditch/canal ways | 385 | **747** | Overpass |
| OSM hospitals/clinics/schools | 749 | **2,290** | Overpass |
| India Flood Inventory entries since 2016 (district) | 4 | **40** | IFI v3, Zenodo |
| OpenAlex works "X AND flood" | 211 | **623** | OpenAlex |
| OpenAlex works "X AND waterlogging" | **25** | 11 | OpenAlex |
| Locality-level waterlogging reports verified in this run | **93 localities / 14 dated events** | not verified | cited news archive |
| IMD 0.25° gridded rainfall, ERA5, CHIRPS | yes | yes | — |

## Weighted scoring (0–10 per criterion)

| Criterion | Weight | Kolkata | Mumbai | Basis |
|---|---:|---:|---:|---|
| Historical flood observations | 25% | 7 | 7 | Mumbai far richer at event level (IFI); Kolkata verified at locality level |
| Rainfall observations | 20% | 7 | 7 | identical products; different representativeness issues |
| Satellite-derived flood extent | 15% | 8 | 4 | 4.5× more Sentinel-1 acquisitions in Kolkata |
| Elevation & terrain | 10% | 4 | 7 | Kolkata's relief ~10 m ≈ DSM error |
| Land use | 10% | 7 | 7 | WorldCover/JRC for both |
| Drainage & infrastructure | 10% | 4 | 5 | neither city publishes storm-drain data |
| Population & exposure | 5% | 8 | 6 | far more complete OSM buildings in Kolkata |
| Independent validation | 5% | 6 | 7 | Mumbai: IFI and literature |
| **Weighted total** | | **6.55** | **6.30** | |

## Sensitivity

| Variant | Kolkata | Mumbai |
|---|---:|---:|
| Historical score emphasises locality-level (spatial) evidence (8 / 6) | 6.80 | 6.05 |
| Historical score emphasises event-level (temporal) evidence (6 / 8) | 6.30 | 6.55 |
| Satellite criterion re-scored after the SAR label test (both 3) | 5.80 | 6.15 |

## Decision

**Kolkata was selected as the pilot.** The platform's primary deliverable is a *within-city* spatial susceptibility
map, which requires locality-level observations; these were verified for Kolkata at scale (93 localities, each with a
source URL). Kolkata also offers far denser Sentinel-1 coverage and much more complete OSM building data.

**The choice is not robustly dominant.** The totals differ by 0.25 and the ranking flips if (a) the historical criterion
emphasises event-level records, where Mumbai is ~10× richer, or (b) the satellite criterion is re-scored after our own
finding that Sentinel-1 change detection carries no usable urban-waterlogging signal in Kolkata. We report this openly.
Mumbai is the recommended next city, particularly for temporal event modelling (40 IFI events since 2016) and for terrain
features (130 m relief).

## Is supervised flood-event forecasting feasible?

**No, for either city, with open data.** Neither city publishes time-stamped, systematically recorded urban flood
observations at hourly resolution. The pilot therefore implements:

* **Module A** — presence/background susceptibility from documented localities (spatial);
* **Module B** — city-scale documented event-day discrimination from rainfall (temporal, daily);
* **Module C** — information cut-off (lead-time) experiments, not operational forecasts.
