"""Geocode documented waterlogging localities with OSM Nominatim (usage policy: <=1 req/s, identifying UA).

Every result keeps the Nominatim display name, OSM class/type and id so that each point can be audited.
Positional uncertainty is recorded by feature type: points of interest ~100 m, roads ~half their length
(capped 1.5 km), neighbourhoods ~1 km.
"""
from __future__ import annotations

import json
import time

import pandas as pd
import requests

from ..config import get_city, get_logger
from .manifest import record

log = get_logger(__name__)
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = {"User-Agent": "UFII-research/0.1 (urban flood susceptibility research; contact via GitHub repo)"}
# Localities resolved from the project's own OSM extracts (exact OSM `name`), used where Nominatim failed
# or returned a clearly wrong feature during manual review (review notes in docs/DATA_SOURCES.md).
OSM_OVERRIDES = {
    "Central Avenue": ("roads", "Chittaranjan Avenue", "Central Avenue is the common name of Chittaranjan Avenue"),
    "Chittaranjan Avenue": ("roads", "Chittaranjan Avenue", ""),
    "Sukia Street": ("roads", "Sukea Lane", "closest OSM spelling variant; same locality (Amherst St area)"),
    "Kalikrishna Tagore Street": ("roads", "Kali Krishna Tagore Street", "OSM spelling"),
    "Keshab Chandra Sen Street": ("roads", "Keshab Sen Street", "OSM short name"),
    "Topsia": ("roads", "Topsia Road", "neighbourhood represented by its arterial road"),
    "VIP Road": ("roads", "VIP Road", ""),
    "VIP Road Haldiram": ("roads", "VIP Road", "Haldiram's stretch not separately mapped"),
    "Bidhan Sarani": ("roads", "Bidhan Sarani", ""),
    "Calcutta Medical College": ("critical_facilities", "Calcutta Medical College & Hospital", ""),
    "RG Kar Medical College": ("critical_facilities", "R.G. Kar Medical College & Hospital", ""),
    "Chittaranjan National Cancer Institute": ("critical_facilities", "Chittaranjan National Cancer Institute Hospital", ""),
}
ALIASES = {  # spelling variants used by OSM for names in reports
    "Sukia Street": "Sukeas Street",
    "Chitpore Road": "Rabindra Sarani", "Maa Flyover": "Maa Flyover", "Kidderpore": "Khidirpur",
    "Bhowanipore": "Bhabanipur", "Justice Chandra Madhab Road": "Justice Chandra Madhab Road",
    "Rawdon Street": "Rawdon Street", "Park Circus Connector": "Park Circus Connector",
    "Park Circus Seven Point Crossing": "Park Circus", "VIP Road Haldiram": "VIP Road",
    "Salt Lake Sector III": "Sector III, Bidhannagar", "New Town Action Area I": "Action Area I, New Town",
    "City Centre Salt Lake": "City Centre, Salt Lake", "Chittaranjan National Cancer Institute":
    "Chittaranjan National Cancer Institute", "Nil Ratan Sircar Medical College": "Nil Ratan Sircar Medical College",
    "Patipukur underpass": "Patipukur", "Chetla Hat Road": "Chetla Hat Road", "New Town": "New Town, Rajarhat",
    "Ultadanga": "Ultadanga, Kolkata", "Thanthania Kalibari": "Thanthania", "Exide More": "Exide",
    "Esplanade metro station": "Esplanade metro", "Park Street metro station": "Park Street metro",
}
# Rejected after manual review: the only Nominatim match was a different place with the same name.
REJECT = {"Bhowanipore": "matched a village in Bishnupur-II, not the Kolkata neighbourhood",
          "Esplanade metro station": "matched a Line-3 station in Thakurpukur",
          "Park Street metro station": "matched Sovabazar metro crossing",
          "Kaikhali": "matched Kaikhali village in Bishnupur-I (South 24 Parganas), not Kaikhali near the airport"}
WRONG = {"New Town": "aerodrome", "Ultadanga": "station"}  # reject these Nominatim types for these names


def _search(q: str, bbox) -> list[dict]:
    params = {"q": q, "format": "jsonv2", "limit": 1, "viewbox": f"{bbox[0]},{bbox[3]},{bbox[2]},{bbox[1]}",
              "bounded": 1, "addressdetails": 0}
    for attempt in range(3):
        r = requests.get(NOMINATIM, params=params, headers=UA, timeout=60)
        if r.status_code == 429:
            time.sleep(10)
            continue
        r.raise_for_status()
        return r.json()
    return []


def run(city_id: str = "kolkata") -> None:
    city = get_city(city_id)
    src = city.raw("flood_observations") / "documented_waterlogging_reports.csv"
    df = pd.read_csv(src)
    a, b, c, d = city.bbox
    bbox = (a - 0.05, b - 0.05, c + 0.05, d + 0.05)
    out_rows = []
    cache_p = city.interim() / "geocode_cache.json"
    cache = json.loads(cache_p.read_text()) if cache_p.exists() else {}
    import geopandas as gpd
    from shapely.ops import nearest_points

    layers = {k: gpd.read_parquet(city.raw(f) / f"osm_{k}.parquet").to_crs(city.crs)
              for k, f in (("roads", "infrastructure"), ("critical_facilities", "infrastructure"))}
    for loc in sorted(df["locality"].unique()):
        if loc in OSM_OVERRIDES:
            layer, name, note = OSM_OVERRIDES[loc]
            gdf = layers[layer]
            m = gdf[gdf["name"] == name]
            if len(m):
                u = m.geometry.union_all()
                pt = nearest_points(u, u.centroid)[0]
                length = float(m.geometry.length.sum()) if layer == "roads" else 0.0
                lonlat = gpd.GeoSeries([pt], crs=city.crs).to_crs(4326).iloc[0]
                out_rows.append({"locality": loc, "geocoded": True, "lat": lonlat.y, "lon": lonlat.x,
                                 "osm_category": "highway" if layer == "roads" else "amenity",
                                 "osm_type": f"osm_name_match:{layer}", "osm_id": ";".join(m.osm_id.astype(str)[:5]),
                                 "display_name": f"{name} (project OSM extract) {note}".strip(),
                                 "uncertainty_m": round(min(1500.0, max(100.0, length / 4))) if layer == "roads" else 100})
                continue
        if loc not in cache or (cache.get(loc) and WRONG.get(loc) and cache[loc].get("type") == WRONG[loc]):
            name = ALIASES.get(loc, loc)
            res = _search(f"{name}, Kolkata", bbox) or _search(name, bbox)
            if res and WRONG.get(loc) and res[0].get("type") == WRONG[loc]:
                res = _search(name, bbox) if name != loc else []
                res = [x for x in res if x.get("type") != WRONG[loc]]
            time.sleep(1.1)
            cache[loc] = res[0] if res else None
            cache_p.write_text(json.dumps(cache, indent=1))
        r = cache[loc]
        if loc in REJECT:
            out_rows.append({"locality": loc, "geocoded": False, "display_name": "REJECTED: " + REJECT[loc]})
            continue
        if not r:
            out_rows.append({"locality": loc, "geocoded": False})
            continue
        cat, typ = r.get("category", r.get("class")), r.get("type")
        bb = [float(x) for x in r["boundingbox"]]  # S, N, W, E
        from math import cos, radians
        diag_m = (((bb[1] - bb[0]) * 111_000) ** 2 + ((bb[3] - bb[2]) * 111_000 * cos(radians(22.5))) ** 2) ** 0.5
        if loc == "Diamond Harbour Road":
            unc = 2000.0  # report refers to the Taratala stretch; Nominatim returned the Joka end
        elif cat == "highway":
            unc = min(1500.0, max(100.0, diag_m / 2))
        elif cat in ("amenity", "building", "railway", "tourism", "man_made"):
            unc = 100.0
        else:
            unc = min(2000.0, max(500.0, diag_m / 2))
        out_rows.append({"locality": loc, "geocoded": True, "lat": float(r["lat"]), "lon": float(r["lon"]),
                         "osm_category": cat, "osm_type": typ, "osm_id": f"{r.get('osm_type', '')}/{r.get('osm_id')}",
                         "display_name": r["display_name"], "uncertainty_m": round(unc)})
    g = pd.DataFrame(out_rows)
    out = city.interim() / "documented_localities_geocoded.csv"
    g.to_csv(out, index=False)
    record("documented_localities_geocoded", city_id, out, NOMINATIM, n=len(g), n_geocoded=int(g.geocoded.sum()),
           license="Geocoding results (c) OpenStreetMap contributors, ODbL")
    log.info("geocoded %d / %d", int(g.geocoded.sum()), len(g))


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
