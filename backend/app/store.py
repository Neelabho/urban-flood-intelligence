"""Read-only access to exported city bundles and saved model pipelines (cached in memory)."""
from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("UFII_DATA_DIR", ROOT / "frontend" / "public" / "data"))
MODEL_DIR = Path(os.environ.get("UFII_MODEL_DIR", ROOT / "models"))
BUNDLE_FILES = {"grid": "grid.json", "events": "events.json", "models": "models.json", "exposure": "exposure.json",
                "quality": "data_quality.json", "rainfall": "rainfall_daily.json", "localities": "localities.geojson"}


class NotAvailable(Exception):
    pass


@lru_cache(maxsize=1)
def cities() -> dict[str, Any]:
    p = DATA_DIR / "cities.json"
    if not p.exists():
        raise NotAvailable("cities.json missing - run `python -m flood_intelligence.inference.export`")
    return json.loads(p.read_text())


def city_ids_with_outputs() -> list[str]:
    return [c["id"] for c in cities()["cities"] if c.get("has_outputs")]


@lru_cache(maxsize=32)
def bundle(city: str, key: str) -> Any:
    if city not in city_ids_with_outputs():
        raise NotAvailable(f"no processed outputs for city '{city}'")
    p = DATA_DIR / city / BUNDLE_FILES[key]
    if not p.exists():
        raise NotAvailable(f"{p.name} missing for {city}")
    return json.loads(p.read_text())


@lru_cache(maxsize=4)
def susceptibility_pipeline(city: str):
    import joblib

    p = MODEL_DIR / city / "susceptibility_xgb_pipeline.joblib"
    if not p.exists():
        raise NotAvailable("model pipeline not found; run the training pipeline")
    return joblib.load(p)


@lru_cache(maxsize=4)
def static_features(city: str):
    """Full per-cell feature table (only present where the pipeline has been run locally)."""
    import pandas as pd

    p = ROOT / "data" / "processed" / city / "static_features.parquet"
    if not p.exists():
        raise NotAvailable("static feature table not available in this deployment")
    return pd.read_parquet(p).set_index("cell_id")


class TTLCache:
    """Tiny time-based cache for upstream calls (e.g. the Open-Meteo forecast)."""

    def __init__(self, ttl_s: float):
        self.ttl, self.store = ttl_s, {}

    def get(self, key):
        v = self.store.get(key)
        if v and time.time() - v[0] < self.ttl:
            return v[1]
        return None

    def set(self, key, value):
        self.store[key] = (time.time(), value)
