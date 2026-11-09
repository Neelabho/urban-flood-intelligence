#!/usr/bin/env bash
# Reproduce UFII end to end for one city.
#   scripts/run_pipeline.sh [city] [--skip-download]
# Downloads (~2 GB, ~1 h, network) are skipped with --skip-download when data/raw is already populated.
set -euo pipefail
CITY="${1:-kolkata}"
SKIP_DL="${2:-}"
PY="${PYTHON:-.venv/bin/python}"
cd "$(dirname "$0")/.."

if [[ "$SKIP_DL" != "--skip-download" ]]; then
  echo "== 1. acquisition"
  $PY -m flood_intelligence.ingestion.static_layers "$CITY"   # DEM, WorldCover, JRC GSW, GHS-POP
  $PY -m flood_intelligence.ingestion.osm "$CITY"             # Overpass
  $PY -m flood_intelligence.ingestion.sentinel1 "$CITY"       # Sentinel-1 RTC (~40 min)
  $PY -m flood_intelligence.ingestion.rainfall "$CITY"        # IMD, ERA5, CHIRPS, IMERG windows
  $PY -m flood_intelligence.ingestion.geocode "$CITY"         # Nominatim (1 req/s)
fi
echo "== 2. SAR water detection + label-feasibility test"
$PY -m flood_intelligence.preprocessing.sar_water "$CITY"
echo "== 3. static features"
$PY -m flood_intelligence.features.static_features "$CITY"
echo "== 4. imputation study"
$PY -m flood_intelligence.preprocessing.imputation "$CITY"
echo "== 5. labels and splits"
$PY -m flood_intelligence.features.labels "$CITY"
echo "== 6. susceptibility experiments (Module A)"
$PY -m flood_intelligence.models.susceptibility "$CITY"
$PY -m flood_intelligence.models.deep_tabular "$CITY"       # separate process (OpenMP isolation)
echo "== 7. event-day model and lead-time experiment (Modules B/C)"
$PY -m flood_intelligence.models.dynamic "$CITY"
echo "== 8. catalogue, quality report, web export"
$PY -m flood_intelligence.ingestion.catalog "$CITY"
$PY -m flood_intelligence.inference.export "$CITY"
echo "done"
