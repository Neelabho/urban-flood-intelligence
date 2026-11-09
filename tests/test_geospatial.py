"""Grid, CRS and alignment tests (no downloaded data needed)."""
import numpy as np
from pyproj import Transformer

from flood_intelligence.config import get_city, make_grid, registry


def test_registry_has_pilot_and_planned_cities():
    reg = registry()
    statuses = {c["status"] for c in reg["cities"].values()}
    assert {"pilot", "assessed", "planned"} <= statuses
    assert sum(c["status"] == "pilot" for c in reg["cities"].values()) == 1


def test_grid_is_aligned_and_covers_bbox():
    city = get_city("kolkata")
    g = make_grid(city)
    assert g.crs == "EPSG:32645"
    assert g.transform.c % g.res == 0 and g.transform.f % g.res == 0
    t = Transformer.from_crs("EPSG:4326", g.crs, always_xy=True)
    lon0, lat0, lon1, lat1 = city.bbox
    xs, ys = t.transform([lon0, lon1, lon0, lon1], [lat0, lat0, lat1, lat1])
    x0, y0, x1, y1 = g.bounds
    assert x0 <= min(xs) and x1 >= max(xs) and y0 <= min(ys) and y1 >= max(ys)


def test_cell_centres_roundtrip():
    g = make_grid(get_city("kolkata"))
    lon, lat = g.cell_centres_lonlat()
    assert lon.shape == g.shape
    assert 88.1 < lon.mean() < 88.6 and 22.3 < lat.mean() < 22.8
    # rows go north -> south
    assert (np.diff(lat[:, 0]) < 0).all()


def test_fine_grid_shares_footprint():
    g = make_grid(get_city("kolkata"))
    f = g.fine(10)
    assert np.allclose(f.bounds, g.bounds)
    assert f.shape == (g.height * 10, g.width * 10)


def test_utm_zone_matches_city_longitude():
    for cid, c in registry()["cities"].items():
        zone = int((c["centre"][0] + 180) // 6) + 1
        assert c["utm_epsg"] == 32600 + zone, cid
