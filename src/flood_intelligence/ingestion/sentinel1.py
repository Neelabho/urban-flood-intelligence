"""Sentinel-1 RTC (radiometrically terrain-corrected gamma0) acquisition from Microsoft Planetary Computer.

Each acquisition (date x relative orbit) is mosaicked from its frames, block-averaged from the 20 m overview
onto the city's 25 m sub-grid (multilooking reduces speckle) and stored as int16 dB x 100.
Source: https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc (Copernicus Sentinel data, processed
by Catalyst/PC; free and open access).
"""
from __future__ import annotations

import csv
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject

from ..config import City, Grid, get_logger, make_grid
from .manifest import record

log = get_logger(__name__)
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
FINE = 10  # 250 m / 10 = 25 m


def search(city: City, start: str, end: str, months: tuple[int, ...]) -> dict[tuple[str, str], list]:
    cat = pystac_client.Client.open(STAC)
    items = cat.search(collections=["sentinel-1-rtc"], bbox=city.bbox, datetime=f"{start}/{end}").items()
    groups: dict[tuple[str, str], list] = defaultdict(list)
    for it in items:
        if it.datetime.month not in months:
            continue
        orb = f"{it.properties['sat:orbit_state'][0].upper()}{it.properties['sat:relative_orbit']:03d}"
        groups[(it.datetime.strftime("%Y-%m-%d"), orb)].append(it)
    return groups


def _read_to_grid(href: str, grid: Grid) -> np.ndarray:
    dst = np.full(grid.shape, np.nan, dtype="float32")
    with rasterio.open(href) as src:
        win = rasterio.windows.from_bounds(*grid.bounds, transform=src.transform)
        win = win.round_offsets().round_lengths()
        # read at ~20 m (GDAL picks the 2x overview) then average onto 25 m grid
        out_h, out_w = max(1, int(win.height // 2)), max(1, int(win.width // 2))
        arr = src.read(1, window=win, out_shape=(out_h, out_w), boundless=True, fill_value=src.nodata,
                       resampling=Resampling.average).astype("float32")
        arr[(arr == src.nodata) | (arr <= 0)] = np.nan
        wt = src.window_transform(win) * rasterio.Affine.scale(win.width / out_w, win.height / out_h)
        reproject(arr, dst, src_transform=wt, src_crs=src.crs, dst_transform=grid.transform, dst_crs=grid.crs,
                  resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    return dst


def fetch_group(key: tuple[str, str], items: list, grid: Grid, outdir: Path, pols=("vv", "vh")) -> dict | None:
    date, orb = key
    rec = {"date": date, "orbit": orb, "time_utc": items[0].datetime.strftime("%H:%M"),
           "platform": items[0].properties.get("platform"), "items": ";".join(i.id for i in items)}
    for pol in pols:
        out = outdir / f"{date}_{orb}_{pol}.tif"
        rec[f"{pol}_path"] = out.name
        if out.exists():
            continue
        mosaic = np.full(grid.shape, np.nan, dtype="float32")
        for it in items:
            signed = planetary_computer.sign(it)
            a = _read_to_grid(signed.assets[pol].href, grid)
            mosaic = np.where(np.isnan(mosaic), a, mosaic)
        db = np.where(np.isfinite(mosaic), 10 * np.log10(np.clip(mosaic, 1e-6, None)), np.nan)
        q = np.where(np.isfinite(db), np.round(db * 100), -32768).astype("int16")
        prof = dict(driver="GTiff", height=grid.height, width=grid.width, count=1, dtype="int16", crs=grid.crs,
                    transform=grid.transform, nodata=-32768, compress="deflate", predictor=2, tiled=True)
        with rasterio.open(out, "w", **prof) as dst:
            dst.write(q, 1)
            dst.update_tags(units="gamma0 dB x100", source="sentinel-1-rtc (Microsoft Planetary Computer)",
                            items=rec["items"])
    vv = rasterio.open(outdir / rec["vv_path"]).read(1)
    rec["valid_fraction"] = round(float((vv != -32768).mean()), 4)
    return rec


def run(city_id: str = "kolkata", start: str = "2017-01-01", end: str = "2025-12-31",
        months: tuple[int, ...] = (5, 6, 7, 8, 9, 10, 11), workers: int = 8) -> Path:
    from ..config import get_city

    city = get_city(city_id)
    grid = make_grid(city).fine(FINE)
    outdir = city.raw("satellite", "sentinel1")
    groups = search(city, start, end, months)
    log.info("%s: %d acquisitions (date x orbit) to fetch", city_id, len(groups))
    rows = []
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fetch_group, k, v, grid, outdir): k for k, v in sorted(groups.items())}
        for n, f in enumerate(as_completed(futs), 1):
            try:
                r = f.result()
                if r:
                    rows.append(r)
            except Exception as e:  # noqa: BLE001 - log and continue; failures listed in index
                log.warning("failed %s: %s", futs[f], e)
                rows.append({"date": futs[f][0], "orbit": futs[f][1], "error": str(e)[:200]})
            if n % 25 == 0:
                log.info("%d/%d", n, len(futs))
    idx = outdir / "index.csv"
    keys = sorted({k for r in rows for k in r})
    with idx.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["date"], r["orbit"])))
    record("sentinel1_rtc", city_id, idx, STAC + "/collections/sentinel-1-rtc",
           n_acquisitions=len(rows), months=list(months), period=f"{start}/{end}", grid_res_m=grid.res)
    return idx


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
