import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Loading } from './components/ui'

const Overview = lazy(() => import('./pages/Overview'))
const Intelligence = lazy(() => import('./pages/Intelligence'))
const Live = lazy(() => import('./pages/Live'))
const Forecasting = lazy(() => import('./pages/Forecasting'))
const Events = lazy(() => import('./pages/Events'))
const Exposure = lazy(() => import('./pages/Exposure'))
const Research = lazy(() => import('./pages/Research'))
const Observatory = lazy(() => import('./pages/Observatory'))
const Methodology = lazy(() => import('./pages/Methodology'))
const About = lazy(() => import('./pages/About'))

// Clean URLs (/live/) so search engines can index every page. Each route is pre-rendered to its own
// index.html at build time (scripts/prerender-routes.mjs), so static hosts serve them with HTTP 200.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')
export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Suspense fallback={<Loading what="page" />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="intelligence" element={<Intelligence />} />
            <Route path="live" element={<Live />} />
            <Route path="forecasting" element={<Forecasting />} />
            <Route path="events" element={<Events />} />
            <Route path="exposure" element={<Exposure />} />
            <Route path="research" element={<Research />} />
            <Route path="observatory" element={<Observatory />} />
            <Route path="methodology" element={<Methodology />} />
            <Route path="about" element={<About />} />
            <Route path="*" element={<div className="p-8 text-sm">Page not found.</div>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
