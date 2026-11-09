import { Callout, PageHeader, Section } from '../components/ui'

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
      <PageHeader eyebrow="About" title="Urban Flood Intelligence India (UFII)">
        A research-oriented, open-source platform for studying urban waterlogging in Indian cities, starting with Kolkata.
      </PageHeader>
      <Section>
        <div className="prose-ufii max-w-3xl text-[14px] text-slate">
          <p>UFII is a research prototype built to explore what can — and cannot — be learned about urban flood susceptibility from openly available data. It favours transparent
            methods, explicit uncertainty and full provenance over headline accuracy. It is a foundation for further research, not an operational warning service.</p>
          <h3>Use and limitations</h3>
          <ul>
            <li>Not an official forecast or warning. Follow the India Meteorological Department and municipal authorities.</li>
            <li>Susceptibility is relative to this study area and to documented reports; it is not a flood probability.</li>
            <li>Population figures are modelled (GHS-POP), and OSM-based counts are incomplete.</li>
            <li>No result is claimed to transfer to other cities without independent testing.</li>
          </ul>
          <h3>Data credits</h3>
          <p>Contains modified Copernicus Sentinel data (2017–2025) processed by Microsoft Planetary Computer; Copernicus DEM © DLR/Airbus; ESA WorldCover © ESA/VITO (CC BY 4.0);
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
    </div>
  )
}
