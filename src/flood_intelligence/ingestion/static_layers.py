"""Static raster layers clipped to a city's study area and stored at native resolution in the city UTM CRS.

* Copernicus DEM GLO-30 (DSM, 30 m)            - planetary computer `cop-dem-glo-30`
* ESA WorldCover 2021 v200 (10 m land cover)    - planetary computer `esa-worldcover`
* JRC Global Surface Water v1.4 (occurrence, seasonality, 30 m) - planetary computer `jrc-gsw`
* GHS-POP R2023A epoch 2020 (3 arc-sec, ~90 m) - JRC GHSL (windowed HTTP read)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject
from rasterio.windows import from_bounds

from ..config import City, get_city, get_logger
from .manifest import record

log = get_logger(__name__)
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PAD = 0.03  # degrees of padding so neighbourhood operations (flow routing, buffers) have context


def _padded(city: City) -> tuple[float, float, float, float]:
    a, b, c, d = city.bbox
    return (a - PAD, b - PAD, c + PAD, d + PAD)


def _mosaic_to_utm(hrefs: list[str], city: City, out: Path, res: float, resampling: Resampling,
                   dtype: str | None = None, band: int = 1) -> Path:
    bbox = _padded(city)
    arrays, transforms = [], []
    srcs = [rasterio.open(h) for h in hrefs]
    mosaic, mtrans = merge(srcs, bounds=bbox if srcs[0].crs.to_epsg() == 4326 else None, indexes=[band])
    src_crs, nodata = srcs[0].crs, srcs[0].nodata
    dtype = dtype or srcs[0].dtypes[0]
    for s in srcs:
        s.close()
    h, w = mosaic.shape[1:]
    left, top = mtrans.c, mtrans.f
    right, bottom = left + w * mtrans.a, top + h * mtrans.e
    dt, dw, dh = calculate_default_transform(src_crs, city.crs, w, h, left, bottom, right, top, resolution=res)
    dst = np.full((dh, dw), nodata if nodata is not None else 0, dtype=dtype)
    reproject(mosaic[0], dst, src_transform=mtrans, src_crs=src_crs, dst_transform=dt, dst_crs=city.crs,
              resampling=resampling, src_nodata=nodata, dst_nodata=nodata)
    prof = dict(driver="GTiff", height=dh, width=dw, count=1, dtype=dtype, crs=city.crs, transform=dt,
                nodata=nodata, compress="deflate", tiled=True)
    with rasterio.open(out, "w", **prof) as f:
        f.write(dst, 1)
    del arrays, transforms
    return out


def _items(collection: str, city: City, **query):
    cat = pystac_client.Client.open(STAC, modifier=planetary_computer.sign_inplace)
    return list(cat.search(collections=[collection], bbox=_padded(city), **query).items())


def fetch_dem(city: City) -> Path:
    items = _items("cop-dem-glo-30", city)
    out = city.raw("elevation") / "copernicus_glo30_dem_utm30m.tif"
    _mosaic_to_utm([i.assets["data"].href for i in items], city, out, 30.0, Resampling.bilinear, "float32")
    record("copernicus_dem_glo30", city.id, out, STAC + "/collections/cop-dem-glo-30",
           items=[i.id for i in items])
    return out


def fetch_worldcover(city: City) -> Path:
    items = _items("esa-worldcover", city, query={"esa_worldcover:product_version": {"eq": "2.0.0"}})
    out = city.raw("landcover") / "esa_worldcover_2021_v200_utm10m.tif"
    _mosaic_to_utm([i.assets["map"].href for i in items], city, out, 10.0, Resampling.nearest, "uint8")
    record("esa_worldcover_2021", city.id, out, STAC + "/collections/esa-worldcover", items=[i.id for i in items])
    return out


def fetch_jrc_gsw(city: City) -> list[Path]:
    items = _items("jrc-gsw", city)
    outs = []
    for asset in ("occurrence", "seasonality"):
        out = city.raw("hydrology") / f"jrc_gsw_v1_4_{asset}_utm30m.tif"
        _mosaic_to_utm([i.assets[asset].href for i in items], city, out, 30.0, Resampling.nearest, "uint8")
        record(f"jrc_gsw_{asset}", city.id, out, STAC + "/collections/jrc-gsw", items=[i.id for i in items])
        outs.append(out)
    return outs


GHSL_BASE = ("https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/"
             "GHS_POP_E2020_GLOBE_R2023A_4326_3ss/V1-0/tiles/")


def _ghsl_tiles(bbox: tuple[float, float, float, float]) -> list[str]:
    """GHSL 4326 tiles are 10 x 10 degrees; column 1 starts at -180 E, row 1 at 89.1 N (offset grid)."""
    names = set()
    for lon in (bbox[0], bbox[2]):
        for lat in (bbox[1], bbox[3]):
            c = int((lon + 180.0 + 0.0079) // 10) + 1
            r = int((89.0996 - lat) // 10) + 1
            names.add(f"R{r}_C{c}")
    return sorted(names)


def fetch_population(city: City) -> Path:
    """GHS-POP R2023A, epoch 2020, 3 arc-second (~90 m) residential population (JRC, CC BY 4.0).

    WorldPop 2020 was the first choice but its server ignores HTTP range requests, which would force a
    489 MB national download; GHS-POP tiles support windowed reads.
    """
    out = city.raw("population") / "ghs_pop_e2020_r2023a_3ss.tif"
    bbox = _padded(city)
    hrefs = []
    for t in _ghsl_tiles(bbox):
        name = f"GHS_POP_E2020_GLOBE_R2023A_4326_3ss_V1_0_{t}"
        hrefs.append(f"/vsizip//vsicurl/{GHSL_BASE}{name}.zip/{name}.tif")
    with rasterio.Env(GDAL_HTTP_MAX_RETRY=5, GDAL_HTTP_RETRY_DELAY=3):
        srcs = [rasterio.open(h) for h in hrefs]
        a, tr = merge(srcs, bounds=bbox)
        prof = srcs[0].profile | dict(height=a.shape[1], width=a.shape[2], transform=tr, compress="deflate",
                                      tiled=True, blockxsize=256, blockysize=256)
        for s_ in srcs:
            s_.close()
    with rasterio.open(out, "w", **prof) as f:
        f.write(a[0], 1)
    record("ghs_pop_2020", city.id, out, GHSL_BASE, tiles=_ghsl_tiles(bbox),
           note="residential population per ~90 m cell (GHS-POP R2023A, epoch 2020); modelled, not census counts")
    return out


def run(city_id: str = "kolkata") -> None:
    city = get_city(city_id)
    for fn in (fetch_dem, fetch_worldcover, fetch_jrc_gsw, fetch_population):
        try:
            log.info("%s: %s", city_id, fn.__name__)
            fn(city)
        except Exception as e:  # noqa: BLE001
            log.error("%s failed: %s", fn.__name__, e)


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
