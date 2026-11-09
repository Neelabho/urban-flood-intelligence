"""Rainfall acquisition for three independent products (kept separate, never blended silently).

1. IMD 0.25 deg gridded daily rainfall (Pai et al. 2014, MAUSAM 65:1-18) - gauge-based, *observed/interpolated*.
   Daily totals are for the 24 h ending 08:30 IST (03:00 UTC) on the stated date.
   Source: https://imdpune.gov.in/cmpg/Griddata/Rainfall_25_Bin.html (binary .grd, 135 x 129 grid, 6.5-38.5N,
   66.5-100E, -999 = missing).
2. CHIRPS v2.0 daily 0.05 deg (Funk et al. 2015) - *satellite-derived* (infrared CCD + station blending).
   Source: https://data.chc.ucsb.edu/products/CHIRPS/v2.0/global_daily/cogs/p05/ (windowed COG reads).
2b. GPM IMERG V06 Final half-hourly 0.1 deg - *satellite-derived*. The only anonymous mirror (Planetary
   Computer Zarr, 2000-06..2021-05) stores 12-step global uncompressed chunks (~311 MB), so multi-year
   extraction is infeasible without NASA Earthdata credentials; IMERG is used for event case studies only.
3. ERA5 hourly total precipitation 0.25 deg - *reanalysis* (model), via the Open-Meteo archive API.
   Used for sub-daily accumulations and periods not covered by IMERG.
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import xarray as xr

from ..config import City, get_city, get_logger
from .manifest import record

log = get_logger(__name__)
IMD_URL = "https://imdpune.gov.in/cmpg/Griddata/rainfall.php"
IMD_LON = 66.5 + 0.25 * np.arange(135)
IMD_LAT = 6.5 + 0.25 * np.arange(129)


def fetch_imd_year(year: int, outdir: Path) -> Path:
    out = outdir / f"imd_rf25_{year}.grd"
    if out.exists() and out.stat().st_size > 20_000_000:
        return out
    r = requests.post(IMD_URL, data={"rain": str(year)}, timeout=600,
                      headers={"User-Agent": "UFII-research/0.1"})
    r.raise_for_status()
    out.write_bytes(r.content)
    record("imd_rf25_daily", "india", out, IMD_URL, year=year)
    return out


def read_imd_grd(path: Path, year: int) -> xr.DataArray:
    a = np.fromfile(path, dtype="<f4")
    nd = a.size // (135 * 129)
    a = a.reshape(nd, 129, 135)
    a = np.where(a <= -998, np.nan, a)
    t = pd.date_range(f"{year}-01-01", periods=nd, freq="D")
    return xr.DataArray(a, coords={"time": t, "lat": IMD_LAT, "lon": IMD_LON}, dims=("time", "lat", "lon"),
                        name="rain_mm")


def imd_city(city: City, years: range) -> Path:
    raw = city.raw("rainfall", "imd").parent  # data/raw/rainfall/imd (national files shared by cities)
    raw.mkdir(parents=True, exist_ok=True)
    lon0, lat0, lon1, lat1 = city.bbox
    frames = []
    for y in years:
        p = fetch_imd_year(y, raw)
        da = read_imd_grd(p, y).sel(lat=slice(lat0 - 0.25, lat1 + 0.25), lon=slice(lon0 - 0.25, lon1 + 0.25))
        frames.append(da)
    da = xr.concat(frames, "time")
    out = city.interim() / "rain_imd_daily.nc"
    da.to_dataset().to_netcdf(out)
    record("imd_rf25_daily_city_subset", city.id, out, IMD_URL, years=f"{years.start}-{years.stop - 1}",
           cells=int(da.lat.size * da.lon.size))
    return out


IMERG_ZARR = "abfs://imerg/gpm-imerg-hhr.zarr"


CHIRPS_URL = "https://data.chc.ucsb.edu/products/CHIRPS/v2.0/global_daily/cogs/p05/{y}/chirps-v2.0.{y}.{m:02d}.{d:02d}.cog"


def chirps_city(city: City, years: range = range(2016, 2027), months=(5, 6, 7, 8, 9, 10)) -> Path:
    """Daily CHIRPS for the study area (May-Oct). CHIRPS days are UTC calendar days (00-24 UTC)."""
    from concurrent.futures import ThreadPoolExecutor

    import rasterio
    from rasterio.windows import from_bounds

    lon0, lat0, lon1, lat1 = city.bbox
    days = [d for d in pd.date_range(f"{years.start}-01-01", f"{years.stop - 1}-12-31") if d.month in months
            and d < pd.Timestamp.today() - pd.Timedelta(days=40)]

    def one(d):
        url = CHIRPS_URL.format(y=d.year, m=d.month, d=d.day)
        try:
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY=4, GDAL_HTTP_RETRY_DELAY=2):
                with rasterio.open("/vsicurl/" + url) as s_:
                    w = from_bounds(lon0 - 0.05, lat0 - 0.05, lon1 + 0.05, lat1 + 0.05, transform=s_.transform)
                    w = w.round_offsets().round_lengths()
                    a = s_.read(1, window=w).astype("float32")
                    tr = s_.window_transform(w)
            a[a < 0] = np.nan
            return d, a, tr
        except Exception:  # noqa: BLE001 - missing days are recorded as NaN (not imputed here)
            return d, None, None

    with ThreadPoolExecutor(12) as ex:
        res = list(ex.map(one, days))
    ok = [r for r in res if r[1] is not None]
    tr = ok[0][2]
    shp = ok[0][1].shape
    lons = tr.c + tr.a * (np.arange(shp[1]) + 0.5)
    lats = tr.f + tr.e * (np.arange(shp[0]) + 0.5)
    arr = np.stack([r[1] if r[1] is not None else np.full(shp, np.nan, "float32") for r in res])
    da = xr.DataArray(arr, coords={"time": [r[0] for r in res], "lat": lats, "lon": lons},
                      dims=("time", "lat", "lon"), name="rain_mm")
    out = city.interim() / "rain_chirps_daily.nc"
    da.to_dataset().to_netcdf(out)
    record("chirps_v2_daily_city_subset", city.id, out, CHIRPS_URL.split("{y}")[0], months=list(months),
           years=f"{years.start}-{years.stop - 1}", days_requested=len(days), days_missing=len(res) - len(ok))
    return out


IMERG_EVENT_WINDOWS = [  # (start, end) UTC; documented events inside the IMERG mirror period
    ("2016-08-16", "2016-08-18"), ("2016-09-04", "2016-09-06"), ("2018-06-24", "2018-06-26"),
    ("2018-07-22", "2018-07-24"), ("2019-08-16", "2019-08-18"), ("2019-11-08", "2019-11-11"),
    ("2020-05-19", "2020-05-22"), ("2021-05-10", "2021-05-12"),
]


def imerg_city(city: City, windows=IMERG_EVENT_WINDOWS) -> Path:
    import planetary_computer

    tok = planetary_computer.sas.get_token("ai4edataeuwest", "imerg").token
    # The store declares calendar='julian' with units 'minutes since 2000-06-01'. Between 2000 and 2100 the
    # Julian and Gregorian calendars share the same leap years, so offsets decode identically; we decode
    # manually to avoid a cftime dependency and verify the last step equals the documented end (2021-05-31 23:30).
    ds = xr.open_zarr(IMERG_ZARR, storage_options={"account_name": "ai4edataeuwest", "credential": tok},
                      consolidated=True, decode_times=False)
    ds["time"] = pd.Timestamp("2000-06-01") + pd.to_timedelta(ds.time.values, unit="min")
    assert ds.time.values[-1] == np.datetime64("2021-05-31T23:30"), ds.time.values[-1]
    lon0, lat0, lon1, lat1 = city.bbox
    sub = ds["precipitationCal"].sel(lat=slice(lat0 - 0.05, lat1 + 0.05), lon=slice(lon0 - 0.05, lon1 + 0.05))
    chunks = []
    for a, b in windows:
        part = sub.sel(time=slice(a, f"{b}T23:59")).load()
        chunks.append(part)
        log.info("IMERG %s..%s -> %d steps", a, b, part.time.size)
    da = xr.concat(chunks, "time")
    da = (da * 0.5).rename("rain_mm")  # mm/hr over a 30-min interval -> mm per half hour
    if da.dims != ("time", "lat", "lon"):
        da = da.transpose("time", "lat", "lon")
    out = city.interim() / "rain_imerg_halfhourly.nc"
    da.to_dataset().to_netcdf(out)
    record("gpm_imerg_v06_hhr_city_subset", city.id, out, "https://planetarycomputer.microsoft.com/dataset/gpm-imerg-hhr",
           windows=windows, variable="precipitationCal", note="event case-study windows only")
    return out


OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"


def era5_city(city: City, start: str = "2016-01-01", end: str = "2026-10-31") -> Path:
    """ERA5 hourly precipitation at the four 0.25 deg reanalysis nodes surrounding the study area."""
    lon0, lat0, lon1, lat1 = city.bbox
    lats = np.arange(np.floor(lat0 * 4) / 4, np.ceil(lat1 * 4) / 4 + 0.01, 0.25)
    lons = np.arange(np.floor(lon0 * 4) / 4, np.ceil(lon1 * 4) / 4 + 0.01, 0.25)
    frames = []
    for la in lats:
        for lo in lons:
            for attempt in range(6):
                r = requests.get(OPEN_METEO, params={
                    "latitude": la, "longitude": lo, "start_date": start, "end_date": end,
                    "hourly": "precipitation", "models": "era5", "timezone": "GMT"}, timeout=300)
                if r.status_code == 429:
                    time.sleep(65)
                    continue
                r.raise_for_status()
                break
            j = r.json()
            df = pd.DataFrame({"time": pd.to_datetime(j["hourly"]["time"]), "rain_mm": j["hourly"]["precipitation"]})
            df["lat"], df["lon"] = la, lo
            df["grid_lat"], df["grid_lon"] = j["latitude"], j["longitude"]
            frames.append(df)
            time.sleep(3)
    df = pd.concat(frames, ignore_index=True)
    out = city.interim() / "rain_era5_hourly.parquet"
    df.to_parquet(out)
    record("era5_hourly_precip_open_meteo", city.id, out, OPEN_METEO, period=f"{start}/{end}",
           nodes=len(frames), note="ERA5 reanalysis (Copernicus C3S) served by Open-Meteo; hour = end of accumulation (UTC)")
    return out


def run(city_id: str = "kolkata") -> None:
    city = get_city(city_id)
    steps = (("imd", lambda: imd_city(city, range(2016, 2026)), city.interim() / "rain_imd_daily.nc"),
             ("era5", lambda: era5_city(city), city.interim() / "rain_era5_hourly.parquet"),
             ("chirps", lambda: chirps_city(city), city.interim() / "rain_chirps_daily.nc"),
             ("imerg", lambda: imerg_city(city), city.interim() / "rain_imerg_halfhourly.nc"))
    for name, fn, out in steps:
        if out.exists():
            continue
        try:
            log.info("%s: rainfall %s", city_id, name)
            fn()
        except Exception as e:  # noqa: BLE001
            log.exception("rainfall %s failed: %s", name, e)


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
