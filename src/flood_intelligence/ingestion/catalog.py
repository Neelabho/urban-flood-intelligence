"""Dataset catalogue, source registry and data-quality report (data/metadata/*.json).

Static descriptions are written here once; download dates, sizes and checksums are merged in from the
download manifest that every acquisition step appends to.
"""
from __future__ import annotations

import json
from collections import defaultdict

import numpy as np
import pandas as pd
import xarray as xr

from ..config import METADATA, get_city, save_json

CATALOG = [
    {"id": "sentinel1_rtc", "title": "Sentinel-1 IW GRD, radiometrically terrain-corrected gamma0 (VV, VH)",
     "provider": "ESA Copernicus; RTC processing by Catalyst, hosted by Microsoft Planetary Computer",
     "url": "https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc", "license": "Copernicus Sentinel data terms (free, open); PC terms of use",
     "period": "2017-05..2025-11 (May-Nov acquisitions)", "temporal_resolution": "6-12 days per orbit",
     "spatial_resolution": "10 m native; stored at 25 m (block-averaged from 20 m overview)", "crs": "EPSG:32645",
     "format": "Cloud-optimised GeoTIFF -> int16 dB x100 GeoTIFF", "nature": "observed (satellite)",
     "used_for": "SAR water-occurrence / backscatter features; label-feasibility test (rejected as label source)",
     "limitations": "C-band SAR is largely blind to shallow flooding between buildings; revisit misses short-lived "
                    "waterlogging; orbit D150 covers only the eastern ~17% of the study area."},
    {"id": "copernicus_dem_glo30", "title": "Copernicus DEM GLO-30 (DSM)", "provider": "ESA / Airbus (Copernicus)",
     "url": "https://planetarycomputer.microsoft.com/dataset/cop-dem-glo-30", "license": "Copernicus DEM licence (free)",
     "period": "2011-2015 acquisitions", "temporal_resolution": "static", "spatial_resolution": "30 m",
     "crs": "EPSG:4326 -> EPSG:32645", "format": "COG", "nature": "observed-derived (surface model)",
     "used_for": "elevation, slope, relative elevation, depressions, flow accumulation, HAND, TWI",
     "limitations": "Surface model includes buildings and trees; vertical error is large relative to Kolkata's ~10 m relief."},
    {"id": "esa_worldcover_2021", "title": "ESA WorldCover 2021 v200", "provider": "ESA / VITO",
     "url": "https://planetarycomputer.microsoft.com/dataset/esa-worldcover", "license": "CC BY 4.0",
     "period": "2021", "temporal_resolution": "static (annual product)", "spatial_resolution": "10 m",
     "crs": "EPSG:4326 -> EPSG:32645", "format": "COG", "nature": "derived (classified satellite imagery)",
     "used_for": "land-cover fractions (built-up as impervious proxy), urban modelling domain",
     "limitations": "Reported overall accuracy ~77% globally; built-up/tree confusion in dense canopy neighbourhoods."},
    {"id": "jrc_gsw", "title": "JRC Global Surface Water v1.4 (occurrence, seasonality)", "provider": "EC JRC / Google",
     "url": "https://planetarycomputer.microsoft.com/dataset/jrc-gsw", "license": "Copernicus programme, free use with attribution",
     "period": "1984-2021", "temporal_resolution": "static summary", "spatial_resolution": "30 m",
     "crs": "EPSG:4326 -> EPSG:32645", "format": "COG", "nature": "derived (Landsat)",
     "used_for": "permanent-water mask (occurrence >= 75%), distance to permanent water",
     "limitations": "Landsat 30 m misses narrow canals and small ponds."},
    {"id": "ghs_pop_2020", "title": "GHS-POP R2023A, epoch 2020, 3 arc-second", "provider": "EC JRC (GHSL)",
     "url": "https://ghsl.jrc.ec.europa.eu/ghs_pop2023.php", "license": "CC BY 4.0", "period": "2020",
     "temporal_resolution": "static", "spatial_resolution": "~90 m", "crs": "EPSG:4326 -> EPSG:32645",
     "format": "GeoTIFF (windowed read from zipped tile)", "nature": "modelled (census disaggregated by built volume)",
     "used_for": "population exposure", "limitations": "Modelled estimate, not a census count; local hotspots reflect "
     "built-volume allocation."},
    {"id": "osm", "title": "OpenStreetMap: buildings, roads, waterways, water bodies, critical facilities",
     "provider": "OpenStreetMap contributors via Overpass API", "url": "https://www.openstreetmap.org/",
     "license": "ODbL 1.0", "period": "snapshot 2026-11-09", "temporal_resolution": "snapshot",
     "spatial_resolution": "vector", "crs": "EPSG:4326 -> EPSG:32645", "format": "GeoParquet",
     "nature": "volunteered geographic information",
     "used_for": "road density, drain/canal density, distances, exposure counts, geocoding",
     "limitations": "Completeness varies (visible mapping-campaign tiles in buildings); underground storm drains are "
                    "not mapped; absence in OSM is not absence on the ground."},
    {"id": "imd_rf25_daily", "title": "IMD gridded daily rainfall 0.25 deg (Pai et al. 2014)",
     "provider": "India Meteorological Department, Pune", "url": "https://imdpune.gov.in/cmpg/Griddata/Rainfall_25_Bin.html",
     "license": "IMD open data (free download for research)", "period": "2016-2025",
     "temporal_resolution": "daily (08:30 IST to 08:30 IST)", "spatial_resolution": "0.25 deg",
     "crs": "EPSG:4326", "format": "binary .grd", "nature": "observed (gauge network, interpolated)",
     "used_for": "event-day rainfall features; event rainfall context",
     "limitations": "Interpolated from stations; strong local gradients (e.g., 224 mm vs 3 mm in adjacent cells on "
                    "2025-09-23) indicate station-sampling effects; 2025 values may be provisional."},
    {"id": "chirps_v2_daily", "title": "CHIRPS v2.0 daily 0.05 deg", "provider": "UCSB Climate Hazards Center",
     "url": "https://data.chc.ucsb.edu/products/CHIRPS/v2.0/global_daily/cogs/p05/", "license": "CC BY 4.0 (public domain dedication)",
     "period": "2016-2026 (May-Oct)", "temporal_resolution": "daily (UTC day)", "spatial_resolution": "0.05 deg",
     "crs": "EPSG:4326", "format": "COG", "nature": "satellite-derived (IR + station blending)",
     "used_for": "satellite rainfall product in the RQ2 comparison",
     "limitations": "Underestimates convective extremes (e.g., ~62 mm vs ~250 mm observed on 22-23 Sep 2025); some "
                    "days unavailable from the server (HTTP 403)."},
    {"id": "gpm_imerg_v06_hhr", "title": "GPM IMERG V06 Final, half-hourly 0.1 deg", "provider": "NASA GPM / PPS; Zarr mirror by Microsoft PC",
     "url": "https://planetarycomputer.microsoft.com/dataset/gpm-imerg-hhr", "license": "NASA open data",
     "period": "event windows 2016-2021", "temporal_resolution": "30 min", "spatial_resolution": "0.1 deg",
     "crs": "EPSG:4326", "format": "Zarr", "nature": "satellite-derived",
     "used_for": "sub-daily case studies of documented events only",
     "limitations": "Anonymous mirror ends 2021-05 and stores 311 MB global chunks; multi-year use needs NASA Earthdata credentials."},
    {"id": "era5_hourly", "title": "ERA5 hourly total precipitation (via Open-Meteo archive API)",
     "provider": "ECMWF / Copernicus C3S; served by Open-Meteo", "url": "https://open-meteo.com/en/docs/historical-weather-api",
     "license": "CC BY 4.0 (Open-Meteo), Copernicus licence (ERA5)", "period": "2016-01..2026-10",
     "temporal_resolution": "hourly", "spatial_resolution": "0.25 deg (9 nodes)", "crs": "EPSG:4326",
     "format": "JSON -> Parquet", "nature": "reanalysis (model)",
     "used_for": "sub-daily intensity features, lead-time experiment, 2026 season (IMD not yet released)",
     "limitations": "Reanalysis smooths convective peaks (on IMD wet days >20 mm, ERA5 city-mean totals are ~61% of IMD; daily Pearson r = 0.67)."},
    {"id": "documented_waterlogging_reports", "title": "Documented waterlogging localities (compiled for this project)",
     "provider": "UFII compilation from cited news reports (Millennium Post, Deccan Herald/PTI)",
     "url": "data/raw/flood_observations/kolkata/documented_waterlogging_reports.csv", "license": "facts with source citations (project CC BY 4.0)",
     "period": "2021-06..2026-09", "temporal_resolution": "event dates", "spatial_resolution": "locality (geocoded, 100 m-2 km uncertainty)",
     "crs": "EPSG:4326", "format": "CSV", "nature": "observational reports (secondary sources)",
     "used_for": "positive labels for susceptibility; event-day labels",
     "limitations": "Reporting bias toward central/arterial locations and accessible archives; absence of a report is not "
                    "absence of flooding; geocoding uncertainty."},
    {"id": "india_flood_inventory", "title": "India Flood Inventory-Impacts (IFI) v3", "provider": "Saharia et al., Zenodo",
     "url": "https://doi.org/10.5281/zenodo.16994648", "license": "CC BY-NC 4.0", "period": "1967-2023",
     "temporal_resolution": "event", "spatial_resolution": "district", "crs": "-", "format": "CSV",
     "nature": "compiled inventory (IMD Disastrous Weather Events, EM-DAT, DFO)",
     "used_for": "historical event catalogue; event-day labels (Kolkata district)",
     "limitations": "District-level, fatality-oriented; sparse for urban waterlogging."},
]


def run(city_id: str = "kolkata") -> None:
    city = get_city(city_id)
    man = json.loads((METADATA / "download_manifest.json").read_text())
    by = defaultdict(list)
    for m in man:
        by[m["dataset_id"]].append(m)
    cat = []
    for c in CATALOG:
        related = [m for k, v in by.items() if k.startswith(c["id"].split("_")[0]) or c["id"] in k for m in v]
        cat.append({**c, "downloads": [{"path": m["path"], "downloaded_utc": m["downloaded_utc"],
                                        "bytes": m.get("bytes"), "sha256": m.get("sha256")} for m in related]})
    save_json(cat, METADATA / "dataset_catalog.json")
    save_json([{"id": c["id"], "provider": c["provider"], "url": c["url"], "license": c["license"],
                "nature": c["nature"]} for c in CATALOG], METADATA / "source_registry.json")

    # ---- data-quality report (measured, not asserted)
    feats = pd.read_parquet(city.processed() / "static_features.parquet")
    imp = json.loads((city.processed() / "imputation_audit.json").read_text())
    sc = pd.read_csv(city.interim() / "sar" / "scenes.csv")
    s1 = pd.read_csv(city.raw("satellite", "sentinel1") / "index.csv")
    imd = xr.open_dataset(city.interim() / "rain_imd_daily.nc").rain_mm
    chirps = xr.open_dataset(city.interim() / "rain_chirps_daily.nc").rain_mm
    era = pd.read_parquet(city.interim() / "rain_era5_hourly.parquet")
    lon0, lat0, lon1, lat1 = city.bbox
    imd_c = imd.sel(lat=slice(lat0 - 0.125, lat1 + 0.125), lon=slice(lon0 - 0.125, lon1 + 0.125)).mean(["lat", "lon"]).to_series()
    eh = era.groupby("time").rain_mm.mean()
    eday = eh.groupby((eh.index - pd.Timedelta(hours=3)).ceil("D")).sum()
    idx = imd_c.index.intersection(eday.index)
    wet = imd_c[idx] > 20
    sar_expl = pd.read_csv(city.interim() / "sar" / "exploratory_newwater_by_landcover.csv")
    rep = {
        "generated_for": city_id,
        "static_features": {"n_cells": len(feats), "missing": imp["missingness"]["columns"],
                            "hand_missingness": {k: imp["missingness"][k] for k in
                                                 ("hand_missing_neighbour_share", "hand_missing_neighbour_expected_if_random",
                                                  "interpretation")}},
        "imputation": {"selected": imp["selected_imputer"], "rule": imp["selection_rule"], "summary": imp["summary"],
                       "safeguards": imp["safeguards"]},
        "sentinel1": {"acquisitions": len(s1), "by_orbit": s1.orbit.value_counts().to_dict(),
                      "by_year": s1.date.str[:4].value_counts().sort_index().to_dict(),
                      "partial_coverage_acquisitions_lt90pct": int((s1.valid_fraction < 0.9).sum()),
                      "otsu_threshold_within_bounds_share": float(sc.otsu_in_bounds.mean()),
                      "label_feasibility_test": {
                          "n_pairs": len(sar_expl),
                          "mean_new_water_frac_built": float(sar_expl.new_built.mean()),
                          "max_new_water_frac_built": float(sar_expl.new_built.max()),
                          "mean_new_water_frac_crop": float(sar_expl.new_crop.mean()),
                          "spearman_built_vs_rain3d": float(sar_expl.new_built.corr(sar_expl.rain3, method="spearman")),
                          "spearman_crop_vs_rain3d": float(sar_expl.new_crop.corr(sar_expl.rain3, method="spearman")),
                          "conclusion": "No rainfall-driven open-water signal in built-up cells; SAR change detection "
                                        "rejected as a label source for urban waterlogging."}},
        "rainfall": {
            "imd_days": int(imd.time.size), "imd_missing_cells_in_study_area": int(np.isnan(imd_c).sum()),
            "chirps_days_requested": int(chirps.time.size),
            "chirps_days_missing": int(chirps.isnull().all(["lat", "lon"]).sum()),
            "era5_hours": int(eh.size),
            "imd_vs_era5_daily_pearson": float(np.corrcoef(imd_c[idx], eday[idx])[0, 1]),
            "era5_to_imd_ratio_on_imd_wet_days_gt20mm": float(eday[idx][wet].mean() / imd_c[idx][wet].mean()),
            "example_2025_09_23": "IMD cells: 224 mm (22.5N 88.0E) vs 3 mm (22.5N 88.25E); press reports 251.4 mm at "
                                  "Alipore - station-sampling effect in the gridded product",
        },
        "osm": {"buildings_mapped_cells_share": float((feats.osm_building_count > 0).mean()),
                "note": "rectangular mapping-campaign patches visible; building counts are used for exposure only"},
    }
    save_json(rep, METADATA / "data_quality_report.json")


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
