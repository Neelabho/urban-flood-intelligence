"""Model-pipeline tests: reproducibility, grouped-CV leakage, serialization, metric sanity."""
import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold

from flood_intelligence.evaluation.metrics import (
    best_f1_threshold,
    cluster_bootstrap,
    expected_calibration_error,
    score,
)
from flood_intelligence.models.common import N_FOLDS, SEED, oof_predict, pipe
from flood_intelligence.preprocessing.sar_water import otsu_bounded


@pytest.fixture
def toy():
    X, y = make_classification(800, 8, weights=[0.95], random_state=0)
    X = pd.DataFrame(X, columns=[f"f{i}" for i in range(8)])
    X.iloc[::17, 2] = np.nan  # missing values handled by the in-pipeline imputer
    groups = np.repeat(np.arange(80), 10)
    return X, y, groups


def test_oof_is_reproducible(toy):
    X, y, g = toy
    a = oof_predict(pipe(LogisticRegression(max_iter=500)), X, y, g)
    b = oof_predict(pipe(LogisticRegression(max_iter=500)), X, y, g)
    assert np.allclose(a, b)
    assert ((a >= 0) & (a <= 1)).all()


def test_grouped_cv_never_splits_a_group(toy):
    X, y, g = toy
    for tr, te in StratifiedGroupKFold(N_FOLDS, shuffle=True, random_state=SEED).split(X, y, g):
        assert not set(g[tr]) & set(g[te])


def test_pipeline_serialization_roundtrip(toy, tmp_path):
    import joblib
    X, y, _ = toy
    m = pipe(LogisticRegression(max_iter=500)).fit(X, y)
    p = tmp_path / "m.joblib"
    joblib.dump(m, p)
    assert np.allclose(joblib.load(p).predict_proba(X), m.predict_proba(X))


def test_metrics_sanity():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 2000)
    perfect = y.astype(float)
    s = score(y, perfect)
    assert s["roc_auc"] == 1.0 and s["recall"] == 1.0
    rand = rng.random(2000)
    assert abs(score(y, rand)["roc_auc"] - 0.5) < 0.05
    assert expected_calibration_error(y, perfect) < 1e-9
    assert 0 < best_f1_threshold(y, rand) < 1
    s2 = score(y, rng.random(2000) * 50)  # non-probabilistic score: no Brier
    assert s2["brier"] is None


def test_cluster_bootstrap_ci_contains_point_estimate():
    rng = np.random.default_rng(1)
    y = rng.integers(0, 2, 1000)
    p = np.clip(y * 0.3 + rng.random(1000) * 0.7, 0, 1)
    g = np.repeat(np.arange(50), 20)
    ci = cluster_bootstrap(y, p, g, n_boot=200)
    est = score(y, p)["roc_auc"]
    assert ci["roc_auc"][0] <= est <= ci["roc_auc"][1]


def test_otsu_bounded_respects_physical_bounds():
    rng = np.random.default_rng(0)
    land = rng.normal(-7, 2, 100_000)
    water = rng.normal(-22, 1.5, 3_000)
    t, _ = otsu_bounded(np.r_[land, water], (-22.0, -15.0), (-30, 2))
    assert -22.0 <= t <= -15.0
    t2, ok = otsu_bounded(np.array([np.nan] * 10), (-22.0, -15.0), (-30, 2))
    assert t2 == -18.5 and not ok
