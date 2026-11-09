import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Public site address, used for canonical links, the sitemap and share previews. Override with VITE_SITE_URL.
process.env.VITE_SITE_URL ??= 'https://neelabho.github.io/urban-flood-intelligence'

// GitHub Pages serves the site under /<repo>/ ; set VITE_BASE in CI. Locally the app is served from '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
        },
      },
    },
  },
  server: { port: 5173 },
})
