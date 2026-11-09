"""Export pipeline outputs as compact JSON for the static web application (Mode A).

Every file carries `generated_utc` and the provenance of its contents. Nothing here creates new numbers:
values are copied (and rounded) from processed outputs and experiment results.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np
import pandas as pd
import xarray as xr
from pyproj import Transformer

from ..config import FRONTEND_DATA, METADATA, ROOT, get_city, make_grid, registry
from ..features.labels import all_hazard_features

NOW = datetime.now(UTC).isoformat(timespec="seconds")

FIELD_META = {
    "sus_pct": ("Relative susceptibility (percentile)", "%", "model", "XGBoost, documented-locality labels"),
    "sus_cls": ("Susceptibility class", "class", "model", "quantile classes of the percentile"),
    "sus_sd": ("Ensemble spread (SD of percentile)", "pct-pts", "model", "30-member block bootstrap"),
    "sus_p05": ("Ensemble 5th percentile", "%", "model", "30-member block bootstrap"),
    "sus_p95": ("Ensemble 95th percentile", "%", "model", "30-member block bootstrap"),
    "elev_mean": ("Mean surface elevation (DSM)", "m", "derived", "Copernicus GLO-30"),
    "elev_min": ("Minimum surface elevation (DSM)", "m", "derived", "Copernicus GLO-30"),
    "hand_mean": ("Height above nearest drainage", "m", "derived", "GLO-30 + OSM stream burning (pysheds)"),
    "twi_mean": ("Topographic wetness index", "-", "derived", "GLO-30 (pysheds)"),
    "depression_depth_mean": ("Mean depression depth", "m", "derived", "GLO-30 depression filling"),
    "slope_mean": ("Mean slope", "deg", "derived", "GLO-30"),
    "relelev_1km": ("Elevation relative to 1 km surroundings", "m", "derived", "GLO-30"),
    "lc_built_frac": ("Built-up fraction", "0-1", "derived", "ESA WorldCover 2021"),
    "lc_tree_frac": ("Tree-cover fraction", "0-1", "derived", "ESA WorldCover 2021"),
    "lc_crop_frac": ("Cropland fraction", "0-1", "derived", "ESA WorldCover 2021"),
    "lc_water_frac": ("Open-water fraction", "0-1", "derived", "ESA WorldCover 2021"),
    "perm_water_frac": ("Permanent-water fraction", "0-1", "derived", "JRC GSW occurrence >= 75%"),
    "osm_waterbody_frac": ("Mapped water-body fraction (ponds)", "0-1", "observed", "OpenStreetMap"),
    "dist_waterway_m": ("Distance to mapped waterway", "m", "derived", "OpenStreetMap"),
    "dist_drain_canal_m": ("Distance to mapped canal/drain", "m", "derived", "OpenStreetMap"),
    "sar_water_occurrence": ("SAR open-water occurrence", "0-1", "observed", "Sentinel-1 RTC, 297 scenes"),
    "sar_vv_mean_db": ("Mean SAR VV backscatter", "dB", "observed", "Sentinel-1 RTC"),
    "road_density_km_km2": ("Road density", "km/km2", "observed", "OpenStreetMap"),
    "osm_building_count": ("Mapped buildings", "count", "observed", "OpenStreetMap (completeness varies)"),
    "population": ("Residential population (modelled)", "persons", "modelled", "GHS-POP R2023A 2020"),
    "facilities_health": ("Hospitals and clinics", "count", "observed", "OpenStreetMap"),
    "facilities_education": ("Schools, colleges, universities", "count", "observed", "OpenStreetMap"),
    "facilities_emergency": ("Fire and police stations", "count", "observed", "OpenStreetMap"),
}
CLASSES = ["very low", "low", "moderate", "high", "very high"]
ROLES = ["background", "positive", "excluded_buffer", "excluded_nonurban"]


def _w(path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), default=_default, allow_nan=False))


def _default(o):
    if isinstance(o, (np.floating,)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.isoformat()
    raise TypeError(type(o))


def _clean(x):
    """Replace NaN/inf recursively with None (JSON has no NaN)."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_clean(v) for v in x]
    if isinstance(x, float) and not np.isfinite(x):
        return None
    return x


def _arr(s: pd.Series, nd: int):
    v = s.to_numpy(dtype="float64")
    return [None if not np.isfinite(a) else (round(a, nd) if nd else int(round(a))) for a in v]


def export_grid(city, out) -> None:
    grid = make_grid(city)
    f = pd.read_parquet(city.processed() / "static_features.parquet")
    p = pd.read_parquet(city.processed() / "susceptibility_predictions.parquet")
    df = f.merge(p.drop(columns=["row", "col", "lon", "lat"]), on="cell_id")
    t = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True)
    cx = grid.transform.c + np.arange(grid.width + 1) * grid.res
    cy = grid.transform.f - np.arange(grid.height + 1) * grid.res
    X, Y = np.meshgrid(cx, cy)
    lon, lat = t.transform(X, Y)
    fields = {
        "sus_pct": _arr(df.susceptibility_pct * 100, 1),
        "sus_cls": [CLASSES.index(c) for c in df.susceptibility_class],
        "sus_sd": _arr(df.susceptibility_pct_ens_sd * 100, 1),
        "sus_p05": _arr(df.susceptibility_pct_ens_p05 * 100, 1),
        "sus_p95": _arr(df.susceptibility_pct_ens_p95 * 100, 1),
        "role": [ROLES.index(r) for r in df.role],
        "urban": df.urban_domain.astype(int).tolist(),
        "hand_imputed": df.hand_imputed.astype(int).tolist(),
    }
    for k in FIELD_META:
        if k.startswith("sus_"):
            continue
        nd = 0 if k in ("osm_building_count", "population", "facilities_health", "facilities_education",
                        "facilities_emergency", "dist_waterway_m", "dist_drain_canal_m") else 3
        fields[k] = _arr(df[k], nd)
    top3 = [json.loads(s) for s in df.shap_top3]
    meta = {k: {"label": v[0], "unit": v[1], "kind": v[2], "source": v[3]} for k, v in FIELD_META.items()}
    _w(out / "grid.json", {
        "generated_utc": NOW, "city": city.id, "crs": grid.crs, "res_m": grid.res, "height": grid.height,
        "width": grid.width, "corners": {"lon": np.round(lon.ravel(), 6).tolist(), "lat": np.round(lat.ravel(), 6).tolist()},
        "fields": fields, "field_meta": meta, "classes": CLASSES, "roles": ROLES, "shap_top3": top3,
        "notes": ["Susceptibility is relative (percentile within the study area), not an event probability.",
                  "Cells outside the urban modelling domain (built-up < 25%) are extrapolations.",
                  "HAND was imputed (KNN) where flagged."]})


def export_localities(city, out) -> None:
    g = pd.read_csv(city.processed() / "documented_localities_cells.csv")
    rep = pd.read_csv(city.raw("flood_observations") / "documented_waterlogging_reports.csv")
    allg = pd.read_csv(city.interim() / "documented_localities_geocoded.csv")
    feats = []
    for _, r in g.iterrows():
        rr = rep[rep.locality == r.locality]
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(r.lon, 6), round(r.lat, 6)]},
                      "properties": {"locality": r.locality, "cell_id": int(r.cell_id), "uncertainty_m": int(r.uncertainty_m),
                                     "osm_match": r.display_name, "n_events": int(r.n_events),
                                     "events": sorted(rr.event_date.unique().tolist()),
                                     "sources": sorted(rr.source_url.unique().tolist())}})
    ungeo = allg[~allg.geocoded.astype(bool)][["locality", "display_name"]].fillna("").to_dict("records")
    _w(out / "localities.geojson", {"type": "FeatureCollection", "generated_utc": NOW, "features": feats,
                                    "not_geocoded": ungeo})


def export_events(city, out) -> None:
    dyn = json.loads((city.processed() / "dynamic_results.json").read_text())
    rep = pd.read_csv(city.raw("flood_observations") / "documented_waterlogging_reports.csv")
    cl = pd.read_csv(city.raw("flood_observations") / "documented_event_days_citylevel.csv")
    ifi = pd.read_csv(city.raw("flood_observations").parent / "india" / "India_Flood_Inventory_v3.csv")
    ifi = ifi[ifi["Districts"].astype(str).str.contains("Kolkata", case=False)].copy()
    ifi["d"] = pd.to_datetime(ifi["Start Date"], dayfirst=True, errors="coerce")
    preds = pd.read_parquet(city.processed() / "event_day_predictions.parquet").set_index("date")
    imd = xr.open_dataset(city.interim() / "rain_imd_daily.nc").rain_mm
    lon0, lat0, lon1, lat1 = city.bbox
    imd = imd.sel(lat=slice(lat0 - 0.125, lat1 + 0.125), lon=slice(lon0 - 0.125, lon1 + 0.125))
    imd_max = imd.max(["lat", "lon"]).to_series()
    sc = pd.read_csv(city.interim() / "sar" / "scenes.csv")
    sc["d"] = pd.to_datetime(sc.date)
    s1 = pd.read_csv(city.raw("satellite", "sentinel1") / "index.csv").set_index(["date", "orbit"])
    imerg_p = city.interim() / "rain_imerg_halfhourly.nc"
    imerg = xr.open_dataset(imerg_p).rain_mm.max(["lat", "lon"]).to_series() if imerg_p.exists() else None
    era = pd.read_parquet(city.interim() / "rain_era5_hourly.parquet").groupby("time").rain_mm.max()

    events = []
    dates = sorted(set(rep.event_date) | set(cl.event_date) | set(ifi.d.dropna().dt.strftime("%Y-%m-%d")))
    for ds in dates:
        d = pd.Timestamp(ds)
        srcs = []
        r1 = rep[rep.event_date == ds]
        for u, grp in r1.groupby("source_url"):
            srcs.append({"type": "news report (localities named)", "outlet": grp.outlet.iloc[0], "url": u,
                         "published_ist": grp.published_ist.iloc[0], "date_basis": grp.date_basis.iloc[0]})
        for _, r in cl[cl.event_date == ds].iterrows():
            srcs.append({"type": "news report (city-level)", "outlet": r.outlet, "url": r.source_url,
                         "published_ist": r.published_ist if isinstance(r.published_ist, str) else None,
                         "summary": r.summary})
        i1 = ifi[ifi.d == d]
        for _, r in i1.iterrows():
            srcs.append({"type": "India Flood Inventory (IMD Disastrous Weather Events)", "outlet": "IFI v3 (Zenodo)",
                         "url": "https://doi.org/10.5281/zenodo.16994648", "uei": r.UEI,
                         "cause": r["Main Cause"], "fatalities": None if pd.isna(r["Human fatality"]) else float(r["Human fatality"]),
                         "damage": None if pd.isna(r["Extent of damage "]) else str(r["Extent of damage "]).strip()})
        rain = {"imd_max_cell_mm_day_D": _f(imd_max.get(d)), "imd_max_cell_mm_day_D1": _f(imd_max.get(d + pd.Timedelta(days=1)))}
        if d in preds.index:
            pr = preds.loc[d]
            rain.update({"era5_48h_mm": _f(pr.era5_48h), "era5_max1h_mm": _f(pr.era5_max1h),
                         "chirps_max_cell_48h_mm": _f(pr.get("chirps_max_cell_48h")),
                         "p_event_day_loyo": _f(pr.p_event_day_loyo)})
        win = era.loc[d - pd.Timedelta(days=2) - pd.Timedelta(hours=5.5): d + pd.Timedelta(days=1) - pd.Timedelta(hours=5.5)]
        hourly = {"t_utc": [t.strftime("%Y-%m-%dT%H:%M") for t in win.index], "era5_mm": np.round(win.values, 2).tolist()}
        if imerg is not None:
            iw = imerg.loc[d - pd.Timedelta(days=1): d + pd.Timedelta(days=1)]
            if len(iw):
                hourly["imerg_t_utc"] = [pd.Timestamp(t).strftime("%Y-%m-%dT%H:%M") for t in iw.index]
                hourly["imerg_mm_per_30min"] = np.round(iw.values, 2).tolist()
        sar = []
        for _, s in sc[(sc.d >= d - pd.Timedelta(days=1)) & (sc.d <= d + pd.Timedelta(days=3))].iterrows():
            vf = float(s1.loc[(s.date, s.orbit), "valid_fraction"]) if (s.date, s.orbit) in s1.index else None
            sar.append({"date": s.date, "orbit": s.orbit, "time_utc": s.time_utc, "coverage": vf,
                        "new_water_frac_vs_previous": _f(s.new_water_frac), "previous": s.prev_date if isinstance(s.prev_date, str) else None})
        locs = sorted(r1.locality.unique().tolist())
        in_model = d.month in (5, 6, 7, 8, 9, 10) and d.year >= 2016
        events.append({"date": ds, "year": d.year, "localities": locs, "n_localities": len(locs), "sources": srcs,
                       "rainfall": rain, "hourly": hourly, "sentinel1_within_-1_+3_days": sar,
                       "source_confidence": "high (multiple or named-locality sources)" if len(locs) or len(srcs) > 1 else "medium (single city-level source)",
                       "in_event_day_model": in_model,
                       "limitations": "Observed extent not mapped; locality points are geocoded report mentions. "
                                      + ("Sentinel-1 acquisitions near this date show no open-water signal attributable to "
                                         "street flooding (see methodology)." if sar else "No Sentinel-1 acquisition within -1/+3 days.")})
    _w(out / "events.json", _clean({"generated_utc": NOW, "events": events, "n": len(events),
                                    "definition": dyn.get("events", [])[:0] or "union of documented reports, city-level reports and IFI Kolkata entries"}))


def _f(v):
    try:
        v = float(v)
        return None if not np.isfinite(v) else round(v, 2)
    except (TypeError, ValueError):
        return None


def export_rainfall(city, out) -> None:
    preds = pd.read_parquet(city.processed() / "event_day_predictions.parquet")
    imd = xr.open_dataset(city.interim() / "rain_imd_daily.nc").rain_mm
    lon0, lat0, lon1, lat1 = city.bbox
    imd = imd.sel(lat=slice(lat0 - 0.125, lat1 + 0.125), lon=slice(lon0 - 0.125, lon1 + 0.125))
    ch = xr.open_dataset(city.interim() / "rain_chirps_daily.nc").rain_mm.mean(["lat", "lon"]).to_series()
    im, ix = imd.mean(["lat", "lon"]).to_series(), imd.max(["lat", "lon"]).to_series()
    era = pd.read_parquet(city.interim() / "rain_era5_hourly.parquet").groupby("time").rain_mm.max()
    eday = era.groupby((era.index + pd.Timedelta(hours=5.5)).floor("D")).sum()  # IST calendar day
    days = pd.DatetimeIndex(preds.date)
    pr = preds.set_index("date")
    rows = {"date": [d.strftime("%Y-%m-%d") for d in days],
            "imd_mean": [_f(im.get(d)) for d in days], "imd_max": [_f(ix.get(d)) for d in days],
            "chirps_mean": [_f(ch.get(d)) for d in days], "era5_ist_day": [_f(eday.get(d)) for d in days],
            "era5_max1h": [_f(pr.loc[d, "era5_max1h"]) for d in days],
            "event": [int(pr.loc[d, "label"]) for d in days],
            "p_loyo": [None if pd.isna(pr.loc[d, "p_event_day_loyo"]) else round(float(pr.loc[d, "p_event_day_loyo"]), 4) for d in days]}
    _w(out / "rainfall_daily.json", {"generated_utc": NOW, "conventions": {
        "imd": "IMD day D = 08:30 IST D-1 to 08:30 IST D; mean/max over 0.25 deg cells covering the study area",
        "chirps": "UTC calendar day, mean over 0.05 deg cells", "era5": "IST calendar-day total at the wettest of 9 ERA5 nodes",
        "p_loyo": "leave-one-season-out probability that the day is a documented waterlogging day (ERA5 model)",
        "excluded": "days -1/+1/+2 around documented events are omitted"}, **rows})


def export_models(city, out) -> None:
    sus = json.loads((city.processed() / "susceptibility_results.json").read_text())
    mlp_p = city.processed() / "susceptibility_torch_mlp.json"
    if mlp_p.exists():
        sus["models"]["torch_mlp"] = json.loads(mlp_p.read_text())
    dyn = json.loads((city.processed() / "dynamic_results.json").read_text())
    summ = json.loads((city.processed() / "susceptibility_table_summary.json").read_text())
    exps = []
    for p in sorted((ROOT / "experiments").rglob("*.json")):
        e = json.loads(p.read_text())
        exps.append({"id": e["experiment_id"], "group": e["group"], "date_utc": e["date_utc"],
                     "model": e.get("model"), "validation": e.get("validation"), "git_commit": e.get("git_commit"),
                     "path": str(p.relative_to(ROOT))})
    _w(out / "models.json", _clean({"generated_utc": NOW, "susceptibility": sus, "susceptibility_design": summ,
                                    "dynamic": dyn, "experiments": exps, "features": all_hazard_features()}))


def export_exposure(city, out) -> None:
    f = pd.read_parquet(city.processed() / "static_features.parquet")
    p = pd.read_parquet(city.processed() / "susceptibility_predictions.parquet")
    df = f.merge(p[["cell_id", "susceptibility_class", "urban_domain"]], on="cell_id")
    rows = []
    for c in CLASSES:
        s = df[df.susceptibility_class == c]
        rows.append({"class": c, "cells": int(len(s)), "area_km2": round(len(s) * 0.0625, 2),
                     "population": int(s.population.sum()), "osm_buildings": int(s.osm_building_count.sum()),
                     "road_km": round(float((s.road_density_km_km2 * 0.0625).sum()), 1),
                     "health_facilities": int(s.facilities_health.sum()),
                     "education_facilities": int(s.facilities_education.sum()),
                     "emergency_facilities": int(s.facilities_emergency.sum()),
                     "urban_domain_cells": int(s.urban_domain.sum())})
    import geopandas as gpd
    fac = gpd.read_parquet(city.raw("infrastructure") / "osm_critical_facilities.parquet")
    pts = []
    grid = make_grid(city)
    t = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    x, y = t.transform(fac.geometry.x.values, fac.geometry.y.values)
    col = np.floor((x - grid.transform.c) / grid.res).astype(int)
    row = np.floor((grid.transform.f - y) / grid.res).astype(int)
    ok = (col >= 0) & (col < grid.width) & (row >= 0) & (row < grid.height)
    cls = dict(zip(p.cell_id, p.susceptibility_class))
    pct = dict(zip(p.cell_id, p.susceptibility_pct))
    for i in np.flatnonzero(ok):
        cid = int(row[i] * grid.width + col[i])
        pts.append({"name": fac.name.iloc[i] if isinstance(fac.name.iloc[i], str) else None,
                    "type": fac.amenity.iloc[i] if isinstance(fac.amenity.iloc[i], str) else fac.emergency.iloc[i],
                    "lon": round(float(fac.geometry.x.iloc[i]), 6), "lat": round(float(fac.geometry.y.iloc[i]), 6),
                    "cell_id": cid, "sus_class": cls.get(cid), "sus_pct": round(float(pct.get(cid, np.nan)) * 100, 1)})
    _w(out / "exposure.json", _clean({"generated_utc": NOW, "by_class": rows, "facilities": pts,
                                      "definition": "Potential exposure = assets located in cells of a given relative "
                                                    "susceptibility class. It is not observed damage or affected population.",
                                      "sources": {"population": "GHS-POP R2023A (modelled, 2020)",
                                                  "buildings_roads_facilities": "OpenStreetMap snapshot 2026-11-09"}}))


def export_quality(city, out) -> None:
    q = json.loads((METADATA / "data_quality_report.json").read_text())
    cat = json.loads((METADATA / "dataset_catalog.json").read_text())
    man = json.loads((METADATA / "download_manifest.json").read_text())
    feas = json.loads((ROOT / "research" / "city_feasibility_assessment.json").read_text()) \
        if (ROOT / "research" / "city_feasibility_assessment.json").exists() else None
    sar_expl = pd.read_csv(city.interim() / "sar" / "exploratory_newwater_by_landcover.csv")
    _w(out / "data_quality.json", _clean({"generated_utc": NOW, "quality": q, "catalog": cat,
                                          "manifest_summary": {"n_artifacts": len(man),
                                                               "total_bytes": int(sum(m.get("bytes") or 0 for m in man)),
                                                               "first_download": min(m["downloaded_utc"] for m in man),
                                                               "last_download": max(m["downloaded_utc"] for m in man)},
                                          "manifest": [{k: m.get(k) for k in ("dataset_id", "path", "source_url",
                                                                              "downloaded_utc", "bytes")} for m in man],
                                          "sar_label_test": {"date": sar_expl.date.tolist(),
                                                             "new_built": sar_expl.new_built.round(6).tolist(),
                                                             "new_crop": sar_expl.new_crop.round(6).tolist(),
                                                             "rain3": sar_expl.rain3.round(1).tolist()},
                                          "feasibility": feas}))


def export_cities(out) -> None:
    reg = registry()
    rows = []
    for cid, c in reg["cities"].items():
        has = (FRONTEND_DATA / cid / "grid.json").exists() or (cid == "kolkata")
        rows.append({"id": cid, "name": c["name"], "state": c["state"], "status": c["status"],
                     "centre": c["centre"], "bbox": c["bbox"], "has_outputs": bool(has and c["status"] == "pilot")})
    _w(out / "cities.json", {"generated_utc": NOW, "default_city": reg["default_city"], "cities": rows})


def run(city_id: str = "kolkata") -> None:
    city = get_city(city_id)
    out = FRONTEND_DATA / city_id
    for fn in (export_grid, export_localities, export_events, export_rainfall, export_models, export_exposure,
               export_quality):
        fn(city, out)
    export_cities(FRONTEND_DATA)
    sizes = {p.name: p.stat().st_size for p in out.iterdir()}
    _w(out / "manifest.json", {"generated_utc": NOW, "files": sizes, "pipeline_git_commit": _git()})
    print(json.dumps(sizes, indent=1))


def _git():
    import subprocess
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
