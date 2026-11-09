"""OpenStreetMap features via the Overpass API (ODbL 1.0, (c) OpenStreetMap contributors).

Saved as GeoParquet in EPSG:4326. OSM completeness varies spatially: an absent feature in OSM is
*unknown*, not *absent on the ground*. Coverage indicators are carried into the feature table.
"""
from __future__ import annotations

import time
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import LineString, Point, Polygon

from ..config import City, get_city, get_logger
from .manifest import record

log = get_logger(__name__)
OVERPASS = "https://overpass-api.de/api/interpreter"
MIRRORS = [OVERPASS, "https://overpass.kumi.systems/api/interpreter"]
UA = {"User-Agent": "UFII-research/0.1 (academic flood-risk research project)"}

QUERIES = {
    # name: (overpass body, output kind, raw subfolder)
    "buildings_centroids": ('way["building"]({b});', "center", "infrastructure"),
    "roads": ('way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|'
              'living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]({b});',
              "geom", "infrastructure"),
    "waterways": ('way["waterway"~"^(river|canal|drain|ditch|stream)$"]({b});', "geom", "hydrology"),
    "water_bodies": ('(way["natural"="water"]({b});way["landuse"~"^(reservoir|basin)$"]({b});'
                     'way["water"]({b}););', "geom", "hydrology"),
    "critical_facilities": ('(nwr["amenity"~"^(hospital|clinic|school|college|university|fire_station|police)$"]'
                            '({b});nwr["emergency"="ambulance_station"]({b}););', "center", "infrastructure"),
    "pumping_stations": ('(nwr["man_made"="pumping_station"]({b});nwr["pumping_station"]({b}););', "center",
                         "hydrology"),
}


def _overpass(body: str, bbox: tuple[float, float, float, float], kind: str) -> list[dict]:
    b = f"{bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]}"
    out = "out center tags;" if kind == "center" else "out geom tags;"
    q = f"[out:json][timeout:600];{body.format(b=b)}{out}"
    for attempt in range(6):
        try:
            r = requests.post(MIRRORS[attempt % 2], data={"data": q}, headers=UA, timeout=900)
        except requests.RequestException:
            time.sleep(20)
            continue
        if r.status_code in (429, 502, 503, 504):
            time.sleep(20 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()["elements"]
    raise RuntimeError("Overpass unavailable")


def _to_gdf(elements: list[dict], kind: str) -> gpd.GeoDataFrame:
    rows = []
    keep = ("building", "highway", "waterway", "natural", "water", "landuse", "amenity", "name", "emergency",
            "man_made", "building:levels", "lanes", "layer", "tunnel", "bridge")
    for e in elements:
        tags = e.get("tags", {})
        geom = None
        if kind == "center":
            if e["type"] == "node":
                geom = Point(e["lon"], e["lat"])
            elif "center" in e:
                geom = Point(e["center"]["lon"], e["center"]["lat"])
        elif "geometry" in e:
            coords = [(p["lon"], p["lat"]) for p in e["geometry"] if p]
            if len(coords) >= 4 and coords[0] == coords[-1] and not tags.get("highway") and not tags.get("waterway"):
                geom = Polygon(coords)
            elif len(coords) >= 2:
                geom = LineString(coords)
        if geom is None:
            continue
        rows.append({"osm_id": f"{e['type'][0]}{e['id']}", **{k: tags.get(k) for k in keep}, "geometry": geom})
    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def run(city_id: str = "kolkata", only: list[str] | None = None) -> dict[str, Path]:
    city: City = get_city(city_id)
    a, b, c, d = city.bbox
    bbox = (a - 0.02, b - 0.02, c + 0.02, d + 0.02)
    outs = {}
    for name, (body, kind, folder) in QUERIES.items():
        if only and name not in only:
            continue
        out = city.raw(folder) / f"osm_{name}.parquet"
        if out.exists():
            outs[name] = out
            continue
        log.info("%s: overpass %s", city_id, name)
        # split heavy queries into 3x3 tiles; de-duplicate by OSM id afterwards
        n = 3 if name == "buildings_centroids" else 1
        els, seen = [], set()
        for i in range(n):
            for j in range(n):
                tb = (bbox[0] + (bbox[2] - bbox[0]) * i / n, bbox[1] + (bbox[3] - bbox[1]) * j / n,
                      bbox[0] + (bbox[2] - bbox[0]) * (i + 1) / n, bbox[1] + (bbox[3] - bbox[1]) * (j + 1) / n)
                for e in _overpass(body, tb, kind):
                    k = (e["type"], e["id"])
                    if k not in seen:
                        seen.add(k)
                        els.append(e)
        gdf = _to_gdf(els, kind)
        gdf.to_parquet(out)
        record(f"osm_{name}", city_id, out, OVERPASS, n_features=len(gdf), license="ODbL-1.0",
               query=body.format(b="bbox"))
        log.info("  %d features", len(gdf))
        outs[name] = out
        time.sleep(10)
    return outs


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
