"""Shared modelling helpers (scikit-learn only; safe to import alongside PyTorch)."""
from __future__ import annotations

import numpy as np
from sklearn.base import clone
from sklearn.impute import KNNImputer
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

SEED = 42
N_FOLDS = 5


def pipe(model) -> Pipeline:
    return Pipeline([("scale", StandardScaler()), ("impute", KNNImputer(n_neighbors=8, weights="distance",
                                                                        add_indicator=True)), ("model", model)])


def oof_predict(est, X, y, groups, spatial: bool = True) -> np.ndarray:
    oof = np.zeros(len(y))
    cv = StratifiedGroupKFold(N_FOLDS, shuffle=True, random_state=SEED) if spatial else StratifiedKFold(
        N_FOLDS, shuffle=True, random_state=SEED)
    splits = cv.split(X, y, groups) if spatial else cv.split(X, y)
    for tr, te in splits:
        m = clone(est).fit(X.iloc[tr], y[tr])
        oof[te] = m.predict_proba(X.iloc[te])[:, 1]
    return oof


