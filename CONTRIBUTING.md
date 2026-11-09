# Contributing

1. Create a feature branch from `develop`; open a pull request into `develop`. `main` holds tested releases.
2. Python: `ruff check src backend tests` and `pytest -q` must pass. Frontend: `npm run lint && npm run build` in `frontend/`.
3. **Scientific integrity rules** (non-negotiable): never fabricate observations, labels, events, metrics or references;
   never present imputed, modelled or simulated values as observed; never use future data to build past features; keep
   susceptibility, event-day risk, forecasts, observations, exposure and scenarios distinct in code and UI.
4. New observations must include a source URL, publication time and date basis. New datasets must be added to
   `ingestion/catalog.py` and recorded via `ingestion/manifest.record`.
5. New experiments must log a record with `models/registry.log_experiment`.
6. Adding a city: entry in `config/cities.yaml`, an observation inventory, then `scripts/run_pipeline.sh <city>`.
   Do not apply another city's model without an explicit cross-city test.
7. Never commit raw data, credentials or `.env` files.
