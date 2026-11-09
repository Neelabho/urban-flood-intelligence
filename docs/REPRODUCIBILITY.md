# Reproducing the results

```bash
uv venv --python 3.12 .venv          # or python3.12 -m venv .venv
uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/pip install -e .           # or: uv pip install -e . --python .venv/bin/python
brew install libomp                  # macOS only (XGBoost/LightGBM)

scripts/run_pipeline.sh kolkata                 # full: downloads (~1 h, ~2 GB) + modelling
scripts/run_pipeline.sh kolkata --skip-download # modelling only (~4 min) when data/raw exists
.venv/bin/python -m pytest -q
```

* Seeds: 42 everywhere (folds, models, bootstrap); torch seeded per fold.
* Every experiment writes `experiments/<group>/<id>.json` with dataset hash, git commit, hyper-parameters, metrics.
* The documented-report inventory is version-controlled (`data/raw/flood_observations/kolkata/*.csv`); all other raw
  data are re-downloaded. Upstream services may change (OSM edits, CHIRPS reprocessing, Open-Meteo/ERA5 updates), so
  re-downloads can shift numbers slightly; the manifest's SHA-256 values identify the exact files used.
* Literature corpus: `scripts/research/fetch_literature.py` then `fetch_literature_targeted.py` (OpenAlex is
  rate-limited; the scripts back off).
* Feasibility evidence: `scripts/feasibility/probe_city_data.py`.
