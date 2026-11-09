// Post-build step for static hosting and search engines.
// - writes dist/<route>/index.html for every page, with that page's <title>, description, canonical and
//   Open Graph tags baked in, so hosts serve each URL with HTTP 200 and crawlers see page-specific metadata
// - writes dist/sitemap.xml, dist/robots.txt and dist/404.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const seo = JSON.parse(readFileSync(join(here, '..', 'src', 'seo-pages.json'), 'utf8'))
const site = (process.env.VITE_SITE_URL || seo.default_site_url).replace(/\/$/, '')
const shell = readFileSync(join(dist, 'index.html'), 'utf8')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const today = new Date().toISOString().slice(0, 10)

function render(path, page) {
  const url = site + (path === '/' ? '/' : `${path}/`)
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(page.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
}

const urls = []
for (const [path, page] of Object.entries(seo.pages)) {
  const out = path === '/' ? join(dist, 'index.html') : join(dist, path.slice(1), 'index.html')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, render(path, page))
  urls.push(site + (path === '/' ? '/' : `${path}/`))
}
writeFileSync(join(dist, '404.html'), render('/', seo.pages['/']).replace('content="index, follow"', 'content="noindex"'))
writeFileSync(join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`)
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`)
console.log(`prerendered ${urls.length} pages for ${site}`)
