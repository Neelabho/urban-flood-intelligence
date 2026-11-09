"""Backend API tests (FastAPI TestClient; no network except where mocked)."""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "kolkata" in body["cities_with_outputs"]


def test_cities_registry_marks_only_pilot_with_outputs():
    r = client.get("/api/cities").json()
    with_out = [c["id"] for c in r["cities"] if c["has_outputs"]]
    assert with_out == ["kolkata"]
    assert any(c["id"] == "mumbai" and c["status"] == "assessed" for c in r["cities"])


def test_point_query_inside_and_outside():
    r = client.get("/api/flood/susceptibility", params={"lon": 88.35, "lat": 22.57})
    assert r.status_code == 200
    b = r.json()
    assert b["kind"] == "model_estimate"
    assert 0 <= b["susceptibility_percentile"] <= 100
    assert b["ensemble_p05_p95"][0] <= b["ensemble_p05_p95"][1]
    assert client.get("/api/flood/susceptibility", params={"lon": 80.0, "lat": 13.0}).status_code == 404


def test_input_validation():
    assert client.get("/api/flood/susceptibility", params={"lon": 88.35}).status_code == 422
    assert client.get("/api/flood/susceptibility", params={"lon": 500, "lat": 22.5}).status_code == 422
    assert client.get("/api/flood/risk", params={"rain_48h_mm": -5}).status_code == 422
    assert client.get("/api/flood/events", params={"city": "Bad City!"}).status_code == 422


def test_unknown_city_is_404():
    assert client.get("/api/flood/events", params={"city": "chennai"}).status_code == 404


def test_risk_scenario_monotonic_in_rainfall():
    ps = [client.get("/api/flood/risk", params={"rain_48h_mm": r}).json()["p_documented_event_day"] for r in (0, 50, 150, 300)]
    assert ps == sorted(ps)
    r = client.get("/api/flood/risk", params={"rain_48h_mm": 100}).json()
    assert r["kind"] == "simulated_scenario"


def test_events_filters():
    all_ = client.get("/api/flood/events").json()
    loc = client.get("/api/flood/events", params={"with_localities": True}).json()
    assert loc["n"] < all_["n"]
    assert all(e["n_localities"] > 0 for e in loc["events"])
    assert all(e["sources"] for e in all_["events"]), "every event must cite at least one source"


def test_models_and_metrics():
    m = client.get("/api/models/metrics").json()
    assert "xgboost" in m["susceptibility_spatial_cv"]
    for s in m["susceptibility_spatial_cv"].values():
        assert 0 <= s["roc_auc"] <= 1 and 0 <= s["pr_auc"] <= 1


def test_explainability_global_and_cell():
    g = client.get("/api/explainability").json()
    assert len(g["global"]) == 10
    c = client.get("/api/explainability", params={"cell_id": 10054}).json()
    assert c["cell_id"] == 10054
    assert c.get("contributions") or c.get("top")


@pytest.mark.parametrize("path", ["/api/datasets", "/api/data-quality", "/api/exposure", "/api/models"])
def test_simple_endpoints(path):
    assert client.get(path).status_code == 200
