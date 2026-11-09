# Deployment

## Mode A — static site (GitHub Pages)

`.github/workflows/pages.yml` builds `frontend/` with `VITE_BASE=/urban-flood-intelligence/` and deploys `frontend/dist`.
It runs **only on manual dispatch** because:

* the repository is **private**; GitHub Pages for private repositories requires a paid GitHub plan, and publishing
  would make the site public. Do not enable it without deciding that the site may be public.

To publish (owner action):

1. Decide whether the site (not necessarily the repository) may be public.
2. Settings → Pages → Source: *GitHub Actions* (requires GitHub Pro/Team/Enterprise for private repos, or a public repo).
3. Actions → *Deploy static site to GitHub Pages* → Run workflow.

The bundle is fully static (≈ 4.8 MB data + ≈ 2 MB JS, gzip ≈ 0.6 MB JS); HashRouter avoids server rewrites.

## Mode B — API

```bash
pip install -r requirements.txt && pip install -e .
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Environment: `UFII_DATA_DIR`, `UFII_MODEL_DIR`, `UFII_ALLOWED_ORIGINS` (see `.env.example`). The API needs the exported
bundle; per-cell live SHAP also needs `models/kolkata/*.joblib` and `data/processed/kolkata/static_features.parquet`
(otherwise it returns precomputed contributions). Free hosts (e.g., Render, Fly.io, Hugging Face Spaces) can run it,
but none guarantees availability, and none was provisioned in this run (no accounts or billing were created). Point the
frontend at it with `VITE_API_BASE=https://…` at build time and add the site origin to `UFII_ALLOWED_ORIGINS`.

## Local

```bash
.venv/bin/uvicorn backend.app.main:app --port 8000      # API
cd frontend && VITE_API_BASE=http://localhost:8000 npm run dev   # site with Mode B
```
