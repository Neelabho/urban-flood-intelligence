import { Callout, PageHeader, Plain, Section, TechDetails } from '../components/ui'

const DEPS: [string, string, string][] = [
  ['MapLibre GL JS', 'BSD-3-Clause', 'interactive maps'], ['OpenFreeMap / OpenMapTiles', 'OSM-based, free', 'basemap tiles'],
  ['Apache ECharts', 'Apache-2.0', 'charts'], ['React, Vite, Tailwind CSS', 'MIT', 'web application'],
  ['scikit-learn', 'BSD-3-Clause', 'models, CV, imputation'], ['XGBoost, LightGBM', 'Apache-2.0 / MIT', 'gradient boosting'],
  ['PyTorch', 'BSD-3-Clause', 'MLP comparator'], ['SHAP', 'MIT', 'explanations'], ['pysheds', 'GPL-3.0', 'flow routing, HAND (used as a library, not redistributed)'],
  ['rasterio, GDAL, GeoPandas, Shapely, pyproj, xarray', 'BSD/MIT', 'geospatial processing'], ['FastAPI', 'MIT', 'API'],
]

export default function About() {
  return (
    <div>
      <PageHeader eyebrow="About" title="About this website">
        Urban Flood Intelligence India (UFII) is a research project that studies street flooding in Indian cities, starting with Kolkata.
      </PageHeader>
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Plain title="What it is">
            <p>A free, open website that brings together public maps, rain records and news reports to show which parts of Kolkata tend to fill
              with water after heavy rain. Everything it shows can be traced back to where it came from.</p>
            <p className="mt-3">It is built for residents, journalists, students, local officials and researchers who want to understand waterlogging
              in the city.</p>
          </Plain>
          <Plain title="What it is not">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Not an official warning service. Follow the India Meteorological Department and the Kolkata Municipal Corporation.</li>
              <li>Not a prediction for your exact building or a particular day.</li>
              <li>Not proof that an area is safe. Many floods are never reported.</li>
              <li>Not yet ready for other cities. Mumbai has been studied; other cities are planned.</li>
            </ul>
          </Plain>
        </div>
      </Section>
      <TechDetails title="Credits, licences and technical notes">
        <Section>
          <div className="prose-ufii max-w-3xl text-[14px] text-slate">
            <p>UFII is a research prototype built to explore what can, and cannot, be learned about urban flood susceptibility from openly available data. It favours transparent
              methods, explicit uncertainty and full provenance over headline accuracy.</p>
            <h3>Technical limitations</h3>
            <ul>
              <li>Susceptibility is relative to this study area and to documented reports; it is not a flood probability.</li>
              <li>Population figures are modelled (GHS-POP), and OSM-based counts are incomplete.</li>
              <li>No result is claimed to transfer to other cities without independent testing.</li>
            </ul>
            <h3>Data credits</h3>
            <p>Contains modified Copernicus Sentinel data (2017 to 2025) processed by Microsoft Planetary Computer; Copernicus DEM © DLR/Airbus; ESA WorldCover © ESA/VITO (CC BY 4.0);
              JRC Global Surface Water and GHS-POP © European Commission (CC BY 4.0); IMD gridded rainfall © India Meteorological Department; CHIRPS © UCSB Climate Hazards Center;
              ERA5 © ECMWF/Copernicus via Open-Meteo (CC BY 4.0); GPM IMERG © NASA; India Flood Inventory © Saharia et al. (CC BY-NC 4.0); map data © OpenStreetMap contributors (ODbL).
              News reports are cited by URL; only locality names and dates are extracted.</p>
            <h3>Open-source components</h3>
          </div>
          <div className="mt-2 max-w-3xl overflow-x-auto border border-line bg-white">
            <table className="data"><thead><tr><th>Component</th><th>Licence</th><th>Use</th></tr></thead><tbody>{DEPS.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody></table>
          </div>
          <div className="mt-4 max-w-3xl"><Callout>Code is released under the MIT licence. Full dependency and licence notes: <code>docs/OPEN_SOURCE_DEPENDENCIES.md</code>. Research documents: <code>research/</code>.</Callout></div>
        </Section>
      </TechDetails>
    </div>
  )
}
