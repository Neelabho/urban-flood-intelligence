"""Collect quantitative evidence for the pilot-city feasibility assessment.

Every number written by this script is measured from a public source at run time;
nothing is hand-entered. Output: research/city_feasibility_evidence.json
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
import requests
import yaml
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[2]
CITIES = yaml.safe_load((ROOT / "config/cities.yaml").read_text())["cities"]
UA = {"User-Agent": "UFII-research/0.1 (academic project)"}


def s1_scene_stats(bbox: list[float]) -> dict:
    cat = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace
    )
    items = list(
        cat.search(collections=["sentinel-1-rtc"], bbox=bbox, datetime="2017-01-01/2025-12-31").items()
    )
    monsoon = [i for i in items if i.datetime.month in (6, 7, 8, 9, 10)]
    orbits: dict[str, int] = {}
    for i in monsoon:
        key = f"{i.properties.get('sat:orbit_state')}-{i.properties.get('sat:relative_orbit')}"
        orbits[key] = orbits.get(key, 0) + 1
    years = sorted({i.datetime.year for i in monsoon})
    return {
        "total_scenes_2017_2025": len(items),
        "monsoon_scenes_jun_oct": len(monsoon),
        "monsoon_scenes_by_orbit": orbits,
        "years_covered": years,
    }


def dem_relief(bbox: list[float]) -> dict:
    cat = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace
    )
    items = list(cat.search(collections=["cop-dem-glo-30"], bbox=bbox).items())
    vals = []
    for it in items:
        with rasterio.open(it.assets["data"].href) as src:
            w = from_bounds(*bbox, transform=src.transform).round_offsets().round_lengths()
            a = src.read(1, window=w, boundless=True, fill_value=src.nodata or -9999).astype("float32")
            vals.append(a[a > -100].ravel())
    v = np.concatenate(vals)
    return {
        "dem_tiles": len(items),
        "elev_p5_m": float(np.percentile(v, 5)),
        "elev_median_m": float(np.median(v)),
        "elev_p95_m": float(np.percentile(v, 95)),
        "relief_p95_p5_m": float(np.percentile(v, 95) - np.percentile(v, 5)),
    }


def osm_counts(bbox: list[float]) -> dict:
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    q = f"""[out:json][timeout:180];
    (way["building"]({s},{w},{n},{e}););out count;
    (way["highway"]({s},{w},{n},{e}););out count;
    (way["waterway"]({s},{w},{n},{e}););out count;
    (way["waterway"~"drain|ditch|canal"]({s},{w},{n},{e}););out count;
    (nwr["amenity"~"hospital|school|clinic"]({s},{w},{n},{e}););out count;"""
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, headers=UA, timeout=240)
    r.raise_for_status()
    els = [e["tags"] for e in r.json()["elements"]]
    keys = ["building_ways", "highway_ways", "waterway_ways", "drain_ditch_canal_ways", "health_school_features"]
    return {k: int(t["total"]) for k, t in zip(keys, els)}


def openalex_count(query: str) -> int:
    """Count works whose title+abstract match ALL terms (OpenAlex boolean search)."""
    terms = " AND ".join(f'"{t}"' if " " in t else t for t in query.split("|"))
    for attempt in range(8):
        r = requests.get(
            "https://api.openalex.org/works",
            params={"filter": f"title_and_abstract.search:{terms}", "per-page": 1},
            headers=UA,
            timeout=60,
        )
        if r.status_code == 429:
            time.sleep(float(r.json().get("retryAfter", 10)) + 2 + attempt * 3)
            continue
        r.raise_for_status()
        return int(r.json()["meta"]["count"])
    raise RuntimeError("OpenAlex rate limited")


def main() -> None:
    out = {"generated_utc": datetime.now(timezone.utc).isoformat(), "cities": {}}
    for cid in ("kolkata", "mumbai"):
        c = CITIES[cid]
        print("probing", cid, flush=True)
        rec: dict = {"bbox": c["bbox"]}
        rec["sentinel1_rtc"] = s1_scene_stats(c["bbox"])
        rec["terrain_copernicus_glo30"] = dem_relief(c["bbox"])
        rec["openstreetmap_overpass"] = osm_counts(c["bbox"])
        time.sleep(5)
        name = c["name"]
        rec["openalex_works"] = {
            f"{name} AND flood": openalex_count(f"{name}|flood"),
            f"{name} AND waterlogging": openalex_count(f"{name}|waterlogging"),
            f"{name} AND flood AND susceptibility": openalex_count(f"{name}|flood|susceptibility"),
            f"{name} AND flood AND machine learning": openalex_count(f"{name}|flood|machine learning"),
            f"{name} AND Sentinel-1 AND flood": openalex_count(f"{name}|Sentinel-1|flood"),
        }
        out["cities"][cid] = rec
        print(json.dumps(rec, indent=1), flush=True)
    (ROOT / "research/city_feasibility_evidence.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
