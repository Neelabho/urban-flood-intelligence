"""Provenance, observation inventory and processed-data integrity tests."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed" / "kolkata"
REPORTS = ROOT / "data" / "raw" / "flood_observations" / "kolkata" / "documented_waterlogging_reports.csv"
needs_processed = pytest.mark.skipif(not (PROC / "static_features.parquet").exists(), reason="pipeline outputs not present")


def test_documented_reports_are_sourced():
    df = pd.read_csv(REPORTS)
    assert len(df) > 50
    assert df.source_url.str.startswith("http").all(), "every observation must cite a URL"
    assert df.locality.str.len().gt(1).all()
    d = pd.to_datetime(df.event_date, format="%Y-%m-%d")
    assert d.min() >= pd.Timestamp("2016-01-01") and d.max() <= pd.Timestamp("2026-12-31")
    assert df.date_basis.notna().all()


def test_manifest_records_provenance():
    man = json.loads((ROOT / "data" / "metadata" / "download_manifest.json").read_text())
    assert len(man) >= 10
    for m in man:
        assert m["source_url"] and m["downloaded_utc"] and m["dataset_id"]


def test_catalog_covers_required_metadata():
    cat = json.loads((ROOT / "data" / "metadata" / "dataset_catalog.json").read_text())
    req = {"provider", "url", "license", "period", "spatial_resolution", "crs", "format", "nature", "limitations"}
    for c in cat:
        assert req <= set(c), c["id"]


@needs_processed
def test_static_feature_ranges():
    df = pd.read_parquet(PROC / "static_features.parquet")
    from flood_intelligence.config import get_city, make_grid
    g = make_grid(get_city("kolkata"))
    assert len(df) == g.width * g.height
    for c in [c for c in df.columns if c.startswith("lc_") or c.endswith("_frac")]:
        v = df[c].dropna()
        assert v.between(-1e-6, 1 + 1e-6).all(), c
    for c in [c for c in df.columns if c.startswith("dist_")]:
        assert (df[c] >= 0).all(), c
    assert (df.population >= 0).all()
    allowed_nan = {"hand_mean", "hand_min", "osm_buildings_per_built_ha"}
    nan_cols = set(df.columns[df.isna().any()])
    assert nan_cols <= allowed_nan, nan_cols - allowed_nan


@needs_processed
def test_labels_buffer_and_split_have_no_leakage():
    df = pd.read_parquet(PROC / "susceptibility_table.parquet")
    pos = df[df.role == "positive"][["row", "col"]].to_numpy()
    bg = df[df.role == "background"][["row", "col"]].to_numpy()
    # Chebyshev distance from every background cell to nearest positive must exceed the buffer (2 cells)
    d = np.min(np.max(np.abs(bg[:, None, :] - pos[None, :, :]), axis=2), axis=1)
    assert d.min() > 2
    blocks = df.groupby("block_id").split.nunique()
    assert (blocks == 1).all(), "a spatial block appears in both train and test"
    assert df.label.isna().sum() == 0, "labels must never be imputed"
    assert set(df.label.unique()) <= {0, 1}


@needs_processed
def test_event_day_table_excludes_adjacent_days():
    d = pd.read_parquet(PROC / "event_day_table.parquet")
    ev = d.index[d.label == 1]
    for e in ev:
        for k in (-1, 1, 2):
            n = e + pd.Timedelta(days=k)
            if n in d.index:
                assert d.loc[n, "label"] == 1, f"{n} adjacent to event {e} should be excluded"
    assert d.index.month.isin([5, 6, 7, 8, 9, 10]).all()


def test_web_bundle_is_valid_json_without_nan():
    base = ROOT / "frontend" / "public" / "data" / "kolkata"
    for p in base.glob("*.json"):
        txt = p.read_text()
        assert "NaN" not in txt and "Infinity" not in txt, p.name
        json.loads(txt)
    g = json.loads((base / "grid.json").read_text())
    n = g["width"] * g["height"]
    assert all(len(v) == n for v in g["fields"].values())
    assert len(g["corners"]["lon"]) == (g["width"] + 1) * (g["height"] + 1)
