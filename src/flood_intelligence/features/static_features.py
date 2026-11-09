"""Static (time-invariant) per-cell features on the city's 250 m UTM analysis grid.

Every feature is computed from a source recorded in data/metadata/download_manifest.json. Feature groups:

* terrain     - Copernicus GLO-30 DSM: elevation statistics, slope, relative elevation, depression depth,
                and hydrological derivatives from pysheds (stream-burned D8 flow accumulation, HAND, TWI)
* hydrology   - distance to OSM waterways / the Hooghly / JRC permanent water, OSM water-body fraction,
                open-drain/canal density, Sentinel-1 water occurrence and backscatter statistics
* urban       - ESA WorldCover 2021 class fractions, OSM building and road density
* exposure    - GHS-POP 2020 population, critical facilities (kept separate from hazard features)
* coverage    - DEM voids, SAR valid observations, OSM completeness proxy

Note: GLO-30 is a surface model (includes buildings/trees), and in very flat terrain (Kolkata relief ~10 m)
its vertical error is a large fraction of the signal. Terrain derivatives are therefore treated as noisy
predictors and their importance is interpreted cautiously.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import rasterio
import shapely
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.warp import reproject
from scipy import ndimage

from ..config import Grid, get_city, get_logger, make_grid, save_json
from ..ingestion.sentinel1 import FINE

log = get_logger(__name__)
if not hasattr(np, "in1d"):  # pysheds 0.4/0.5 still calls np.in1d, removed in NumPy 2.4; isin is the documented successor
    np.in1d = lambda ar1, ar2, **kw: np.isin(np.ravel(ar1), ar2, **kw)  # type: ignore[attr-defined]
WORLDCOVER = {10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built", 60: "bare", 80: "water",
              90: "wetland", 95: "mangrove"}
BURN_M = 3.0
CHANNEL_CELLS = 1000  # ~0.9 km2 contributing area at 30 m


def _to_grid(src_arr, src_transform, src_crs, grid: Grid, resampling, src_nodata=None, dtype="float32"):
    dst = np.full(grid.shape, np.nan, dtype=dtype)
    reproject(src_arr.astype("float32"), dst, src_transform=src_transform, src_crs=src_crs,
              dst_transform=grid.transform, dst_crs=grid.crs, resampling=resampling,
              src_nodata=src_nodata, dst_nodata=np.nan)
    return dst


def terrain(city, grid: Grid, waterways, perm_water_30m) -> dict[str, np.ndarray]:
    from pysheds.grid import Grid as PGrid
    from pysheds.sview import Raster

    path = city.raw("elevation") / "copernicus_glo30_dem_utm30m.tif"
    with rasterio.open(path) as f:
        dem = f.read(1).astype("float64")
        tr, crs = f.transform, f.crs
    void = ~np.isfinite(dem) | (dem < -50)
    if void.any():  # fill rare voids by nearest valid neighbour (recorded as coverage feature)
        idx = ndimage.distance_transform_edt(void, return_distances=False, return_indices=True)
        dem = dem[tuple(idx)]
    ww = rasterize(((g, 1) for g in waterways.to_crs(crs).geometry), out_shape=dem.shape, transform=tr,
                   all_touched=True, dtype="uint8").astype(bool)
    channels_known = ww | perm_water_30m
    burned = dem - BURN_M * channels_known

    pg = PGrid.from_raster(str(path))
    r = Raster(burned, viewfinder=pg.viewfinder)
    pit = pg.fill_pits(r)
    filled = pg.fill_depressions(pit)
    infl = pg.resolve_flats(filled)
    dirmap = (64, 128, 1, 2, 4, 8, 16, 32)
    fdir = pg.flowdir(infl, dirmap=dirmap)
    acc = np.asarray(pg.accumulation(fdir, dirmap=dirmap), dtype="float64")
    channel = (acc > CHANNEL_CELLS) | channels_known
    hand = np.asarray(pg.compute_hand(fdir, Raster(dem, viewfinder=pg.viewfinder),
                                      Raster(channel, viewfinder=pg.viewfinder), dirmap=dirmap),
                      dtype="float64")
    hand[~np.isfinite(hand)] = np.nan  # cells whose D8 path never reaches a channel (left for imputation)
    depr = np.asarray(pg.fill_depressions(pg.fill_pits(Raster(dem, viewfinder=pg.viewfinder))), dtype="float64") - dem

    gy, gx = np.gradient(dem, 30.0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    tanb = np.maximum(np.tan(np.radians(slope)), 0.001)
    twi = np.log(((acc + 1) * 30.0) / tanb)

    out = {
        "elev_mean": _to_grid(dem, tr, crs, grid, Resampling.average),
        "elev_min": _to_grid(dem, tr, crs, grid, Resampling.min),
        "elev_std": None,
        "slope_mean": _to_grid(slope, tr, crs, grid, Resampling.average),
        "hand_mean": _to_grid(hand, tr, crs, grid, Resampling.average),
        "hand_min": None,
        "twi_mean": _to_grid(twi, tr, crs, grid, Resampling.average),
        "log_flowacc_max": _to_grid(np.log1p(acc), tr, crs, grid, Resampling.max),
        "depression_depth_mean": _to_grid(depr, tr, crs, grid, Resampling.average),
        "depression_frac_gt05m": _to_grid((depr > 0.5).astype("float32"), tr, crs, grid, Resampling.average),
        "dem_void_frac": _to_grid(void.astype("float32"), tr, crs, grid, Resampling.average),
    }
    hm = _to_grid(np.where(np.isfinite(hand), hand, 1e6), tr, crs, grid, Resampling.min)
    out["hand_min"] = np.where(hm > 1e5, np.nan, hm)
    sq = _to_grid(dem ** 2, tr, crs, grid, Resampling.average)
    out["elev_std"] = np.sqrt(np.maximum(sq - out["elev_mean"] ** 2, 0))
    em = np.nan_to_num(out["elev_mean"], nan=np.nanmean(out["elev_mean"]))
    for k, radius in (("relelev_1km", 4), ("relelev_2km", 8)):  # cells (250 m) -> ~1 km and ~2 km windows
        out[k] = out["elev_mean"] - ndimage.uniform_filter(em, size=2 * radius + 1, mode="nearest")
    return out


def _lines_length_per_cell(gdf, grid: Grid, step: float = 10.0) -> np.ndarray:
    geoms = shapely.segmentize(gdf.to_crs(grid.crs).geometry.values, step)
    xs, ys, ws = [], [], []
    for g in geoms:
        parts = getattr(g, "geoms", [g])
        for p in parts:
            c = np.asarray(p.coords)
            if len(c) < 2:
                continue
            mid = (c[1:] + c[:-1]) / 2
            seg = np.hypot(*(c[1:] - c[:-1]).T)
            xs.append(mid[:, 0]); ys.append(mid[:, 1]); ws.append(seg)
    return _hist(np.concatenate(xs), np.concatenate(ys), grid, np.concatenate(ws))


def _hist(x, y, grid: Grid, w=None) -> np.ndarray:
    x0, y0, x1, y1 = grid.bounds
    h, _, _ = np.histogram2d(y, x, bins=[grid.height, grid.width], range=[[y0, y1], [x0, x1]], weights=w)
    return h[::-1].astype("float32")  # histogram rows go south->north; grid rows go north->south


def _distance_to(gdf, grid: Grid, extra_mask: np.ndarray | None = None) -> np.ndarray:
    fine = grid.fine(FINE)
    m = np.zeros(fine.shape, bool)
    if gdf is not None and len(gdf):
        m |= rasterize(((g, 1) for g in gdf.to_crs(grid.crs).geometry), out_shape=fine.shape,
                       transform=fine.transform, all_touched=True, dtype="uint8").astype(bool)
    if extra_mask is not None:
        m |= extra_mask
    d = ndimage.distance_transform_edt(~m) * fine.res
    c = FINE // 2
    return d[c::FINE, c::FINE][: grid.height, : grid.width].astype("float32")


def sar_features(city, grid: Grid) -> dict[str, np.ndarray]:
    """Sentinel-1 water occurrence and backscatter statistics from full-coverage acquisitions (May-Nov)."""
    s1 = city.raw("satellite", "sentinel1")
    idx = pd.read_csv(s1 / "index.csv")
    idx = idx[(idx["valid_fraction"] >= 0.9) & idx["orbit"].isin(["D048", "A012"])]
    n = s_vv = s_vv2 = s_w = None
    for _, r in idx.iterrows():
        with rasterio.open(s1 / r["vv_path"]) as f:
            vv = f.read(1).astype("float32")
        with rasterio.open(s1 / r["vh_path"]) as f:
            vh = f.read(1).astype("float32")
        ok = (vv != -32768) & (vh != -32768)
        vv, vh = vv / 100, vh / 100
        if n is None:
            n, s_vv, s_vv2, s_w = (np.zeros(vv.shape, "float32") for _ in range(4))
        n += ok
        s_vv += np.where(ok, vv, 0)
        s_vv2 += np.where(ok, vv * vv, 0)
        s_w += ok & (vv < -18) & (vh < -24)
    nn = np.maximum(n, 1)
    mean_vv = s_vv / nn
    std_vv = np.sqrt(np.maximum(s_vv2 / nn - mean_vv ** 2, 0))
    occ = s_w / nn

    def agg(a):
        h, w = grid.height, grid.width
        return a[: h * FINE, : w * FINE].reshape(h, FINE, w, FINE).mean(axis=(1, 3)).astype("float32")

    return {"sar_water_occurrence": agg(occ), "sar_vv_mean_db": agg(mean_vv), "sar_vv_temporal_std_db": agg(std_vv),
            "sar_valid_obs": agg(n.astype("float32")), "_sar_n_scenes": len(idx)}


def run(city_id: str = "kolkata") -> None:
    import geopandas as gpd

    city = get_city(city_id)
    grid = make_grid(city)
    F: dict[str, np.ndarray] = {}

    # --- hydrology inputs
    ww = gpd.read_parquet(city.raw("hydrology") / "osm_waterways.parquet")
    wb = gpd.read_parquet(city.raw("hydrology") / "osm_water_bodies.parquet")
    wb = wb[wb.geom_type.isin(["Polygon", "MultiPolygon"])]
    with rasterio.open(city.raw("hydrology") / "jrc_gsw_v1_4_occurrence_utm30m.tif") as f:
        occ = f.read(1).astype("float32")
        occ[occ > 100] = 0
        occ_tr, occ_crs = f.transform, f.crs
    perm30 = occ >= 75

    with rasterio.open(city.raw("elevation") / "copernicus_glo30_dem_utm30m.tif") as f:
        dem_shape, dem_tr = f.shape, f.transform
    perm_dem = np.zeros(dem_shape, "float32")
    reproject(perm30.astype("float32"), perm_dem, src_transform=occ_tr, src_crs=occ_crs, dst_transform=dem_tr,
              dst_crs=city.crs, resampling=Resampling.nearest)
    log.info("terrain + hydrological derivatives (pysheds)")
    F.update(terrain(city, grid, ww[ww.waterway.isin(["river", "canal", "drain", "stream"])], perm_dem > 0.5))

    fine = grid.fine(FINE)
    perm_fine = np.zeros(fine.shape, "float32")
    reproject(perm30.astype("float32"), perm_fine, src_transform=occ_tr, src_crs=occ_crs,
              dst_transform=fine.transform, dst_crs=fine.crs, resampling=Resampling.nearest)
    perm_fine = perm_fine > 0.5
    F["perm_water_frac"] = perm_fine[: grid.height * FINE, : grid.width * FINE].reshape(
        grid.height, FINE, grid.width, FINE).mean(axis=(1, 3)).astype("float32")
    F["jrc_occurrence_mean"] = _to_grid(occ, occ_tr, occ_crs, grid, Resampling.average)
    log.info("distances")
    F["dist_waterway_m"] = _distance_to(ww, grid)
    F["dist_drain_canal_m"] = _distance_to(ww[ww.waterway.isin(["canal", "drain", "ditch"])], grid)
    hooghly = pd.concat([ww[ww.name.fillna("").str.contains("Hooghly|Hugli|Bhagirathi", case=False)],
                         wb[wb.name.fillna("").str.contains("Hooghly|Hugli|Bhagirathi", case=False)]])
    F["dist_hooghly_m"] = _distance_to(hooghly, grid)
    F["dist_perm_water_m"] = _distance_to(None, grid, extra_mask=perm_fine)
    F["drain_canal_density_km_km2"] = _lines_length_per_cell(
        ww[ww.waterway.isin(["canal", "drain", "ditch"])], grid) / 1000 / (grid.res / 1000) ** 2
    wbm = rasterize(((g, 1) for g in wb.to_crs(grid.crs).geometry), out_shape=fine.shape,
                    transform=fine.transform, all_touched=False, dtype="uint8")
    F["osm_waterbody_frac"] = wbm[: grid.height * FINE, : grid.width * FINE].reshape(
        grid.height, FINE, grid.width, FINE).mean(axis=(1, 3)).astype("float32")

    log.info("land cover")
    with rasterio.open(city.raw("landcover") / "esa_worldcover_2021_v200_utm10m.tif") as f:
        wc = f.read(1)
        for k, name in WORLDCOVER.items():
            if name in ("shrub", "mangrove"):
                continue
            F[f"lc_{name}_frac"] = _to_grid((wc == k).astype("float32"), f.transform, f.crs, grid,
                                            Resampling.average)

    log.info("urban fabric (OSM)")
    b = gpd.read_parquet(city.raw("infrastructure") / "osm_buildings_centroids.parquet").to_crs(grid.crs)
    F["osm_building_count"] = _hist(b.geometry.x.values, b.geometry.y.values, grid)
    roads = gpd.read_parquet(city.raw("infrastructure") / "osm_roads.parquet")
    F["road_density_km_km2"] = _lines_length_per_cell(roads, grid) / 1000 / (grid.res / 1000) ** 2
    built_area_ha = F["lc_built_frac"] * (grid.res ** 2) / 1e4
    F["osm_buildings_per_built_ha"] = np.where(built_area_ha > 0.5, F["osm_building_count"] / np.maximum(
        built_area_ha, 1e-6), np.nan).astype("float32")

    log.info("exposure")
    with rasterio.open(city.raw("population") / "ghs_pop_e2020_r2023a_3ss.tif") as f:
        pop = f.read(1).astype("float32")
        pop[pop < 0] = 0
        # convert counts to density (persons / m2) using each pixel's geodesic area, average onto the grid,
        # then multiply by cell area: conserves totals (GDAL 'sum' resampling produced artefacts here)
        lats = f.transform.f + f.transform.e * (np.arange(pop.shape[0]) + 0.5)
        px_area = (abs(f.transform.e) * 111_320.0) * (f.transform.a * 111_320.0 * np.cos(np.radians(lats)))
        dens = pop / px_area[:, None]
        F["population"] = _to_grid(dens, f.transform, f.crs, grid, Resampling.average) * grid.res ** 2
    fac = gpd.read_parquet(city.raw("infrastructure") / "osm_critical_facilities.parquet").to_crs(grid.crs)
    groups = {"health": ["hospital", "clinic"], "education": ["school", "college", "university"],
              "emergency": ["fire_station", "police"]}
    for gname, vals in groups.items():
        s = fac[fac.amenity.isin(vals) | ((gname == "emergency") & (fac.emergency == "ambulance_station"))]
        F[f"facilities_{gname}"] = _hist(s.geometry.x.values, s.geometry.y.values, grid)

    log.info("Sentinel-1 features")
    sar = sar_features(city, grid)
    n_sar = sar.pop("_sar_n_scenes")
    sar.pop("sar_valid_obs")  # identical for every cell (full-coverage scenes only); reported in metadata
    F.update(sar)

    xs, ys = grid.cell_centres()
    lon, lat = grid.cell_centres_lonlat()
    rows, cols = np.meshgrid(np.arange(grid.height), np.arange(grid.width), indexing="ij")
    df = pd.DataFrame({"cell_id": (rows * grid.width + cols).ravel(), "row": rows.ravel(), "col": cols.ravel(),
                       "x": xs.ravel(), "y": ys.ravel(), "lon": np.round(lon.ravel(), 6),
                       "lat": np.round(lat.ravel(), 6)})
    for k, v in F.items():
        df[k] = np.asarray(v, dtype="float32").ravel()
    df["is_water_cell"] = df["perm_water_frac"] >= 0.5
    out = city.processed() / "static_features.parquet"
    df.to_parquet(out, index=False)
    save_json({"grid": grid.to_json(), "n_cells": len(df), "features": list(F), "burn_depth_m": BURN_M,
               "channel_threshold_cells": CHANNEL_CELLS, "sar_scenes_used": n_sar},
              city.processed() / "static_features_meta.json")
    log.info("wrote %s (%d cells x %d features)", out, len(df), len(F))


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
