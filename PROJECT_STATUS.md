# Project status — UFII

_Last updated: 2026-11-09 (end of autonomous build run)._

| Area | Status | Notes |
|---|---|---|
| Workspace & tooling | ✅ Done | Python 3.12 venv (uv), Node 26, GitHub CLI authenticated |
| City feasibility | ✅ Done | Kolkata 6.55 vs Mumbai 6.30; ranking sensitive (disclosed) |
| Literature review | ✅ Done | 95 OpenAlex/Semantic Scholar records with DOIs; scoping (not systematic) |
| Data acquisition | ✅ Done | 12 sources; manifest with SHA-256; IMERG limited to 8 event windows |
| Observation inventory | ✅ Done (limited) | 132 mentions / 93 localities / 14 dated events; 83 geocoded |
| SAR label test | ✅ Done | Negative result; SAR used as features only |
| Features & imputation | ✅ Done | 38 static features; KNN imputation evaluated |
| Module A susceptibility | ✅ Done | 7 models + 3 baselines; spatial/held-out/temporal validation; SHAP; bootstrap uncertainty |
| Module B event-day risk | ✅ Done | 24 event days; product comparison |
| Module C forecasting | ⚠️ Partial by design | Lead-time cut-off experiment only; hourly labels do not exist |
| Module D events | ✅ Done | 94 catalogued events with sources |
| Module E exposure | ✅ Done | Potential exposure by class |
| Deep spatiotemporal models | ❌ Not attempted (justified) | Insufficient labels |
| Cross-city (Mumbai) | ❌ Not done | Registry + pipeline ready; inventory not compiled |
| Backend API | ✅ Done | 12 endpoints, validation, caching, tests |
| Web application | ✅ Done | 10 pages, Mode A static + Mode B API |
| Tests | ✅ 31 passing | data, geospatial, ML, API |
| CI | ✅ Configured | `ci.yml`; first remote run status reported in the delivery report |
| GitHub repository | ✅ Public | https://github.com/Neelabho/urban-flood-intelligence |
| GitHub Pages | ✅ Live | https://neelabho.github.io/urban-flood-intelligence/ (auto-deploys from main) |
| Backend hosting | ⏸ Not provisioned | no free host account created; docs provided |

## Open items
1. Expand and double-code the observation inventory; add Bengali-language and KMC sources.
2. Bare-earth DEM sensitivity (FABDEM, non-commercial licence).
3. Mumbai replication and cross-city transfer test.
4. KMC rain-gauge / sensor data request for sub-daily labels.
5. Verify the site in Google Search Console and submit the sitemap (docs/GOOGLE_SEARCH_CONSOLE.md).
