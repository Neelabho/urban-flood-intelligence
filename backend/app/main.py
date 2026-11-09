"""UFII API (Mode B: dynamic inference). Run: uvicorn backend.app.main:app --port 8000

All responses state what kind of quantity they carry ("model_estimate", "observed", "simulated_scenario",
"rainfall_forecast"). The static site works without this API; the frontend falls back to bundled JSON.
"""
from __future__ import annotations

import math
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pyproj import Transformer

from . import store
from .store import NotAvailable

app = FastAPI(title="Urban Flood Intelligence India API", version="0.1.0",
              description="Research API for urban waterlogging susceptibility and rainfall-conditioned risk (Kolkata pilot).")
origins = [o.strip() for o in os.environ.get("UFII_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])
FORECAST_CACHE = store.TTLCache(900)
CityId = Annotated[str, Query(min_length=2, max_length=32, pattern=r"^[a-z_]+$", description="city id from /api/cities")]


def _bundle(city: str, key: str):
    try:
        return store.bundle(city, key)
    except NotAvailable as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/health")
def health():
    try:
        cs = store.city_ids_with_outputs()
        gen = {c: store.bundle(c, "models")["generated_utc"] for c in cs}
        ok = True
    except NotAvailable as e:
        cs, gen, ok = [], {}, False
        detail = str(e)
    return {"status": "ok" if ok else "degraded", "version": app.version, "cities_with_outputs": cs,
            "outputs_generated_utc": gen, **({} if ok else {"detail": detail})}


@app.get("/api/cities")
def cities():
    try:
        return store.cities()
    except NotAvailable as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/datasets")
def datasets(city: CityId = "kolkata"):
    return {"city": city, "datasets": _bundle(city, "quality")["catalog"]}


@app.get("/api/data-quality")
def data_quality(city: CityId = "kolkata"):
    q = _bundle(city, "quality")
    return {"city": city, "generated_utc": q["generated_utc"], "quality": q["quality"], "manifest_summary": q["manifest_summary"]}


def _cell_payload(g: dict, cid: int) -> dict:
    fields = {k: v[cid] for k, v in g["fields"].items()}
    return {"cell_id": cid, "row": cid // g["width"], "col": cid % g["width"], "kind": "model_estimate",
            "susceptibility_percentile": fields["sus_pct"], "susceptibility_class": g["classes"][fields["sus_cls"]],
            "ensemble_p05_p95": [fields["sus_p05"], fields["sus_p95"]], "ensemble_sd": fields["sus_sd"],
            "inside_urban_domain": bool(fields["urban"]), "hand_imputed": bool(fields["hand_imputed"]),
            "inputs": {k: fields[k] for k in g["field_meta"] if not k.startswith("sus_")},
            "shap_top3": g["shap_top3"][cid], "generated_utc": g["generated_utc"],
            "note": "relative susceptibility within the study area; not an event probability"}


@app.get("/api/flood/susceptibility")
def susceptibility(city: CityId = "kolkata",
                   lon: Annotated[float | None, Query(ge=-180, le=180)] = None,
                   lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
                   min_class: Annotated[Literal["very low", "low", "moderate", "high", "very high"] | None, Query()] = None,
                   limit: Annotated[int, Query(ge=1, le=5000)] = 500):
    """Point query (lon+lat) returns one cell; otherwise cells at or above `min_class`, highest first."""
    g = _bundle(city, "grid")
    if (lon is None) != (lat is None):
        raise HTTPException(422, "provide both lon and lat, or neither")
    if lon is not None:
        t = Transformer.from_crs("EPSG:4326", g["crs"], always_xy=True)
        x, y = t.transform(lon, lat)
        a, _, c, _, e, f = g["transform"]
        col, row = math.floor((x - c) / a), math.floor((y - f) / e)
        if not (0 <= row < g["height"] and 0 <= col < g["width"]):
            raise HTTPException(404, "point outside the study area")
        return _cell_payload(g, row * g["width"] + col)
    k = g["classes"].index(min_class) if min_class else 3
    ids = [i for i, c in enumerate(g["fields"]["sus_cls"]) if c is not None and c >= k]
    ids.sort(key=lambda i: -(g["fields"]["sus_pct"][i] or 0))
    return {"city": city, "kind": "model_estimate", "min_class": g["classes"][k], "n": len(ids),
            "cells": [{"cell_id": i, "percentile": g["fields"]["sus_pct"][i], "sd": g["fields"]["sus_sd"][i]} for i in ids[:limit]]}


def _live_model(city: str) -> dict:
    return _bundle(city, "models")["dynamic"]["live_model"]


def _predict(m: dict, x: dict) -> float:
    z = m["intercept"] + sum(m["coef"][i] * (x[f] - m["mean"][i]) / m["scale"][i] for i, f in enumerate(m["features"]))
    return 1 / (1 + math.exp(-z))


@app.get("/api/flood/risk")
def risk(city: CityId = "kolkata",
         rain_48h_mm: Annotated[float, Query(ge=0, le=1500)] = 100.0,
         peak_hour_share: Annotated[float, Query(gt=0, le=1)] = 0.25,
         antecedent_72h_mm: Annotated[float | None, Query(ge=0, le=3000)] = None):
    """Rainfall scenario -> probability that the day enters the documented waterlogging record (simulated)."""
    m = _live_model(city)
    ante = antecedent_72h_mm if antecedent_72h_mm is not None else m["mean"][m["features"].index("era5_antecedent_72h")]
    x = {"era5_48h": rain_48h_mm, "era5_max1h": rain_48h_mm * peak_hour_share,
         "era5_max3h": min(rain_48h_mm, rain_48h_mm * peak_hour_share * 2),
         "era5_max6h": min(rain_48h_mm, rain_48h_mm * peak_hour_share * 2.8), "era5_antecedent_72h": ante}
    return {"city": city, "kind": "simulated_scenario", "inputs": x, "p_documented_event_day": _predict(m, x),
            "interpretation": m["output"], "model_trained_on": m["trained_on"]}


OPEN_METEO = "https://api.open-meteo.com/v1/forecast"


@app.get("/api/flood/forecast")
async def forecast(city: CityId = "kolkata"):
    """Live rainfall forecast (Open-Meteo) passed through the event-day model. Experimental; not validated."""
    cached = FORECAST_CACHE.get(city)
    if cached:
        return cached
    c = next((c for c in store.cities()["cities"] if c["id"] == city), None)
    if not c or not c.get("has_outputs"):
        raise HTTPException(404, f"no outputs for {city}")
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            r = await cl.get(OPEN_METEO, params={"latitude": c["centre"][1], "longitude": c["centre"][0],
                                                  "hourly": "precipitation", "past_days": 3, "forecast_days": 3,
                                                  "timezone": "GMT"})
            r.raise_for_status()
            j = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"rainfall forecast provider unavailable: {e}") from e
    times = [datetime.fromisoformat(t).replace(tzinfo=UTC) for t in j["hourly"]["time"]]
    p = [v or 0.0 for v in j["hourly"]["precipitation"]]
    m = _live_model(city)
    ist = timedelta(hours=5, minutes=30)
    now = datetime.now(UTC)
    today = (now + ist).replace(hour=0, minute=0, second=0, microsecond=0) - ist
    out = []
    for k in (-1, 0, 1, 2):
        end = today + timedelta(days=k + 1)
        w48 = [v for t, v in zip(times, p) if end - timedelta(hours=48) < t <= end]
        ante = [v for t, v in zip(times, p) if end - timedelta(hours=120) < t <= end - timedelta(hours=48)]
        roll = lambda a, n: max([sum(a[i - n + 1:i + 1]) for i in range(n - 1, len(a))] or [0.0])  # noqa: E731
        x = {"era5_48h": sum(w48), "era5_max1h": max(w48 or [0.0]), "era5_max3h": roll(w48, 3),
             "era5_max6h": roll(w48, 6), "era5_antecedent_72h": sum(ante)}
        out.append({"ist_day_start_utc": (end - timedelta(days=1)).isoformat(), "window_complete": len(w48) == 48,
                    "features": x, "p_documented_event_day": _predict(m, x),
                    "kind": "rainfall_forecast" if end > now else "rainfall_analysis"})
    res = {"city": city, "fetched_utc": now.isoformat(timespec="seconds"), "provider": "Open-Meteo forecast API",
           "days": out, "warning": "Experimental. Rainfall forecast, not a flood forecast; model trained on ERA5 "
                                   "reanalysis and not validated on forecast inputs. Follow IMD advisories."}
    FORECAST_CACHE.set(city, res)
    return res


@app.get("/api/flood/events")
def events(city: CityId = "kolkata", year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
           with_localities: bool = False):
    ev = _bundle(city, "events")["events"]
    ev = [e for e in ev if (year is None or e["year"] == year) and (not with_localities or e["n_localities"] > 0)]
    return {"city": city, "kind": "observed_reports", "n": len(ev), "events": ev}


@app.get("/api/exposure")
def exposure(city: CityId = "kolkata"):
    e = _bundle(city, "exposure")
    return {"city": city, "kind": "potential_exposure", "by_class": e["by_class"], "definition": e["definition"],
            "sources": e["sources"], "n_facilities": len(e["facilities"])}


@app.get("/api/models")
def models(city: CityId = "kolkata"):
    m = _bundle(city, "models")
    s = m["susceptibility"]
    return {"city": city, "generated_utc": m["generated_utc"], "susceptibility": {
        "selection": s["selection"], "design": m["susceptibility_design"], "models": list(s["models"])},
        "dynamic": {"n_days": m["dynamic"]["n_days"], "n_event_days": m["dynamic"]["n_event_days"],
                    "live_model": m["dynamic"]["live_model"]}, "experiments": m["experiments"]}


@app.get("/api/models/metrics")
def metrics(city: CityId = "kolkata"):
    m = _bundle(city, "models")
    s, d = m["susceptibility"], m["dynamic"]
    strip = lambda sc: {k: v for k, v in sc.items() if k not in ("curves",)}  # noqa: E731
    return {"city": city, "susceptibility_spatial_cv": {k: v["spatial_cv"] for k, v in s["models"].items()},
            "susceptibility_holdout": s["holdout_test"], "susceptibility_spatiotemporal": s["spatiotemporal"],
            "random_vs_spatial_cv": s["random_vs_spatial_cv"], "ablation": s["ablation"],
            "dynamic_product_comparison": {k: strip(v)["logistic_loyo"] for k, v in d["product_comparison"]["results"].items()},
            "dynamic_lead_time": d["lead_time"]}


@app.get("/api/explainability")
def explainability(city: CityId = "kolkata", cell_id: Annotated[int | None, Query(ge=0)] = None,
                   top: Annotated[int, Query(ge=1, le=40)] = 10):
    """Global SHAP importance, or a fresh TreeSHAP decomposition for one cell (computed with the saved model)."""
    m = _bundle(city, "models")["susceptibility"]["explainability"]
    if cell_id is None:
        return {"city": city, "global": m["shap_global"][:top], "note": m["note"]}
    g = _bundle(city, "grid")
    if cell_id >= g["width"] * g["height"]:
        raise HTTPException(404, "cell_id outside grid")
    try:
        pipe = store.susceptibility_pipeline(city)
    except NotAvailable:
        return {"city": city, "cell_id": cell_id, "top": g["shap_top3"][cell_id], "source": "precomputed (model file not deployed)"}
    import numpy as np
    import shap

    feats = _bundle(city, "models")["features"]
    try:
        row = store.static_features(city).loc[[cell_id], feats]
    except NotAvailable:
        return {"city": city, "cell_id": cell_id, "top": g["shap_top3"][cell_id],
                "source": "precomputed (full feature table not deployed)"}
    row = row.astype(float)
    pre = pipe[:-1]
    z = pre.transform(row)
    sv = np.asarray(shap.TreeExplainer(pipe.named_steps["model"]).shap_values(z))[0]
    names = feats + [f"missing_{feats[i]}" for i in pipe.named_steps["impute"].indicator_.features_]
    order = np.argsort(-np.abs(sv))[:top]
    return {"city": city, "cell_id": cell_id, "source": "TreeSHAP on saved pipeline",
            "contributions": [{"feature": names[i], "shap": float(sv[i])} for i in order]}
