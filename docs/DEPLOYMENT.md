# Deployment and search-engine publishing

## What the build produces

`cd frontend && npm run build` creates `frontend/dist/`, a fully static site:

* one `index.html` per page (`/`, `/intelligence/`, `/live/`, …) with that page's title, description, canonical
  link and share-preview tags baked in, so every address returns HTTP 200 and search engines see page-specific text;
* `sitemap.xml`, `robots.txt`, `404.html` and `og-image.png` (preview image for WhatsApp, LinkedIn, X, etc.);
* WebSite structured data naming the author.

Two build variables control addresses:

| Variable | Meaning | GitHub Pages value |
|---|---|---|
| `VITE_BASE` | path the site lives under | `/urban-flood-intelligence/` |
| `VITE_SITE_URL` | full public address (canonical links, sitemap) | `https://neelabho.github.io/urban-flood-intelligence` |

For a custom domain at the root (e.g. `https://ufii.example.org`), use `VITE_BASE=/` and `VITE_SITE_URL=https://ufii.example.org`.

## Option A: GitHub Pages (free if the repository is public)

1. Decide that the code and data in this repository may be public. (Pages on a **private** repo needs a paid
   GitHub plan; the published website is public either way.)
2. Make the repository public: GitHub → Settings → General → Danger zone → Change visibility.
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Actions → **Deploy static site to GitHub Pages** → Run workflow (or change the workflow trigger to `push` on
   `main` to redeploy automatically).
5. Site: `https://neelabho.github.io/urban-flood-intelligence/`.

## Option B: keep the repository private, host the site elsewhere (free)

Cloudflare Pages or Netlify can build from a private GitHub repository on their free plans.

* Build command: `cd frontend && npm ci && npm run build`
* Output directory: `frontend/dist`
* Environment: `VITE_BASE=/`, `VITE_SITE_URL=https://<your-project>.pages.dev` (or the Netlify address)

Both need an account on that service, created by the owner.

## Getting found on Google

Publishing makes the site reachable; these steps make Google find and list it faster:

1. Open [Google Search Console](https://search.google.com/search-console) and add the site as a **URL-prefix property**
   (e.g. `https://neelabho.github.io/urban-flood-intelligence/`).
2. Verify ownership with the **HTML tag** method: copy the `<meta name="google-site-verification" …>` tag into
   `frontend/index.html` (inside `<head>`), rebuild and redeploy, then press Verify.
3. Sitemaps → submit `sitemap.xml`.
4. URL Inspection → paste the home page address → **Request indexing**. Repeat for the map page.
5. Indexing usually takes a few days to a few weeks. Links from elsewhere (your GitHub profile README, LinkedIn,
   portfolio, posts) help Google discover and rank it.

Search ranking cannot be guaranteed; new sites usually appear first for specific searches such as
"Kolkata waterlogging map".

## Mode B: the API (optional)

```bash
pip install -r requirements.txt && pip install -e .
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Environment: `UFII_DATA_DIR`, `UFII_MODEL_DIR`, `UFII_ALLOWED_ORIGINS` (see `.env.example`). The public website does
not need the API: every page works from the bundled data. Free API hosts (Render, Fly.io, Hugging Face Spaces) exist
but none guarantees availability. To use one, build the site with `VITE_API_BASE=https://…` and add the site's address
to `UFII_ALLOWED_ORIGINS`.

## Local

```bash
.venv/bin/uvicorn backend.app.main:app --port 8000          # API
cd frontend && npm run dev                                 # site, Mode A
cd frontend && npm run dev:api                             # site connected to the API (port 5174)
```
