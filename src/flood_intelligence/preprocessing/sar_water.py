"""Sentinel-1 open-water detection and pairwise change detection (weak inundation labels).

Method (after Twele et al. 2016, doi:10.1080/01431161.2016.1192304; Clement et al. 2018,
doi:10.1111/jfr3.12303):
  1. Per acquisition, an Otsu threshold (doi:10.1109/tsmc.1979.4310076) on the VV and VH gamma0 dB
     histograms, clipped to physically plausible bounds, classifies open water (VV < t_vv AND VH < t_vh).
  2. For consecutive acquisitions from the *same relative orbit* (identical viewing geometry) no more than
     MAX_GAP_DAYS apart, a pixel is *newly inundated* if it is water at t, not water at t-1, its VV dropped
     by more than DROP_DB, and it is not permanent water (JRC GSW occurrence >= 75 %).
  3. Fractions are aggregated from the 25 m sub-grid to the 250 m analysis grid.

Known blind spots (documented in the methodology and UI): C-band SAR does not reliably see shallow street
flooding among buildings (layover / double-bounce), so labels mainly capture *open-surface* inundation
(roads with open sky, fields, vacant land, peri-urban low-lying ground). Seasonal paddy flooding can also
appear as new water; land-cover stratified evaluation tracks this.
"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from skimage.filters import threshold_otsu

from ..config import City, get_city, get_logger, make_grid, save_json
from ..ingestion.sentinel1 import FINE

log = get_logger(__name__)
VV_BOUNDS = (-22.0, -15.0)
VH_BOUNDS = (-28.0, -20.0)
DROP_DB = 3.0
MAX_GAP_DAYS = 24
PERM_OCCURRENCE = 75


def _read(path) -> np.ndarray:
    with rasterio.open(path) as f:
        a = f.read(1).astype("float32")
    a[a == -32768] = np.nan
    return a / 100.0


def otsu_bounded(x: np.ndarray, lo_hi: tuple[float, float], rng: tuple[float, float]) -> tuple[float, bool]:
    v = x[np.isfinite(x)]
    v = v[(v > rng[0]) & (v < rng[1])]
    if v.size < 1000:
        return float(np.mean(lo_hi)), False
    t = float(threshold_otsu(v, nbins=256))
    return float(np.clip(t, *lo_hi)), lo_hi[0] <= t <= lo_hi[1]


def permanent_water_mask(city: City, fine_grid) -> np.ndarray:
    src = city.raw("hydrology") / "jrc_gsw_v1_4_occurrence_utm30m.tif"
    dst = np.zeros(fine_grid.shape, dtype="float32")
    with rasterio.open(src) as f:
        occ = f.read(1).astype("float32")
        occ[occ > 100] = 0  # 255 = no data / no observation
        reproject(occ, dst, src_transform=f.transform, src_crs=f.crs, dst_transform=fine_grid.transform,
                  dst_crs=fine_grid.crs, resampling=Resampling.nearest)
    return dst >= PERM_OCCURRENCE


def block_mean(a: np.ndarray, f: int) -> np.ndarray:
    h, w = a.shape[0] // f, a.shape[1] // f
    return np.nanmean(a[: h * f, : w * f].reshape(h, f, w, f), axis=(1, 3))


def run(city_id: str = "kolkata") -> None:
    city = get_city(city_id)
    grid = make_grid(city)
    fine = grid.fine(FINE)
    s1dir = city.raw("satellite", "sentinel1")
    idx = pd.read_csv(s1dir / "index.csv")
    idx = idx[idx["error"].isna()] if "error" in idx else idx
    idx["d"] = pd.to_datetime(idx["date"])
    perm = permanent_water_mask(city, fine)
    out = city.interim() / "sar"
    out.mkdir(exist_ok=True)

    scenes = []
    water_stack, newwater_stack, valid_stack = [], [], []
    prev: dict[str, tuple] = {}
    for _, r in idx.sort_values("d").iterrows():
        vv, vh = _read(s1dir / r["vv_path"]), _read(s1dir / r["vh_path"])
        t_vv, ok_vv = otsu_bounded(vv, VV_BOUNDS, (-30, 2))
        t_vh, ok_vh = otsu_bounded(vh, VH_BOUNDS, (-38, -5))
        valid = np.isfinite(vv) & np.isfinite(vh)
        water = valid & (vv < t_vv) & (vh < t_vh)
        rec = {"date": r["date"], "orbit": r["orbit"], "time_utc": r["time_utc"], "t_vv": round(t_vv, 2),
               "t_vh": round(t_vh, 2), "otsu_in_bounds": bool(ok_vv and ok_vh),
               "valid_frac": round(float(valid.mean()), 4),
               "water_frac_nonperm": round(float(water[~perm & valid].mean()) if valid.any() else np.nan, 4),
               "prev_date": None, "gap_days": None, "new_water_frac": None}
        p = prev.get(r["orbit"])
        if p is not None and (r["d"] - p[0]).days <= MAX_GAP_DAYS:
            pd_, pvv, pwater, pvalid = p
            both = valid & pvalid
            new = both & water & ~pwater & ((vv - pvv) < -DROP_DB) & ~perm
            rec.update(prev_date=pd_.strftime("%Y-%m-%d"), gap_days=int((r["d"] - pd_).days),
                       new_water_frac=round(float(new[both & ~perm].mean()) if both.any() else np.nan, 5))
            k = len(newwater_stack)
            nw = np.where(both, new.astype("float32"), np.nan)
            newwater_stack.append(block_mean(nw, FINE).astype("float32"))
            valid_stack.append(block_mean(both.astype("float32"), FINE).astype("float32"))
            water_stack.append(block_mean(np.where(valid, water.astype("float32"), np.nan), FINE).astype("float32"))
            rec["pair_index"] = k
        prev[r["orbit"]] = (r["d"], vv, water, valid)
        scenes.append(rec)
    sc = pd.DataFrame(scenes)
    sc.to_csv(out / "scenes.csv", index=False)
    np.savez_compressed(out / "pairs_250m.npz", new_water_frac=np.stack(newwater_stack),
                        valid_frac=np.stack(valid_stack), water_frac=np.stack(water_stack),
                        perm_frac=block_mean(perm.astype("float32"), FINE))
    save_json({"vv_bounds": VV_BOUNDS, "vh_bounds": VH_BOUNDS, "drop_db": DROP_DB, "max_gap_days": MAX_GAP_DAYS,
               "perm_occurrence_pct": PERM_OCCURRENCE, "fine_res_m": fine.res, "grid": grid.to_json(),
               "n_scenes": len(sc), "n_pairs": len(newwater_stack),
               "generated": date.today().isoformat()}, out / "sar_params.json")
    log.info("%d scenes, %d same-orbit pairs", len(sc), len(newwater_stack))


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
