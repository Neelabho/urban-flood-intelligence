import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
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

// HashRouter: deep links work on static hosting (GitHub Pages) without server rewrites.
export default function App() {
  return (
    <HashRouter>
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
    </HashRouter>
  )
}
