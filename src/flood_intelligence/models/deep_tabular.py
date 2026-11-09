"""Advanced comparator for Module A: a small PyTorch MLP trained on identical spatial folds.

Runs as its own process (no XGBoost/LightGBM import) to avoid the duplicate-OpenMP segfault on macOS.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin

from ..config import get_city, get_logger
from ..evaluation.metrics import cluster_bootstrap, curves, score
from ..features.labels import all_hazard_features
from .common import SEED, oof_predict, pipe
from .registry import dataset_version, log_experiment

log = get_logger(__name__)


class TorchMLP(ClassifierMixin, BaseEstimator):
    """Small fully-connected network (PyTorch) with the scikit-learn estimator interface."""

    def __init__(self, hidden=(64, 32), epochs=120, lr=1e-3, weight_decay=1e-3, pos_weight=1.0, seed=SEED):
        self.hidden = hidden
        self.epochs = epochs
        self.lr = lr
        self.weight_decay = weight_decay
        self.pos_weight = pos_weight
        self.seed = seed

    def fit(self, X, y):
        import torch

        torch.manual_seed(self.seed)
        X = torch.tensor(np.asarray(X, dtype="float32"))
        y = torch.tensor(np.asarray(y, dtype="float32"))
        layers, d = [], X.shape[1]
        for h in self.hidden:
            layers += [torch.nn.Linear(d, h), torch.nn.ReLU(), torch.nn.Dropout(0.2)]
            d = h
        layers.append(torch.nn.Linear(d, 1))
        self.net = torch.nn.Sequential(*layers)
        opt = torch.optim.AdamW(self.net.parameters(), lr=self.lr, weight_decay=self.weight_decay)
        lossf = torch.nn.BCEWithLogitsLoss(pos_weight=torch.tensor(self.pos_weight))
        g = torch.Generator().manual_seed(self.seed)
        for _ in range(self.epochs):
            perm = torch.randperm(len(X), generator=g)
            for i in range(0, len(X), 256):
                b = perm[i:i + 256]
                opt.zero_grad()
                loss = lossf(self.net(X[b]).squeeze(1), y[b])
                loss.backward()
                opt.step()
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        import torch

        self.net.eval()
        with torch.no_grad():
            p = torch.sigmoid(self.net(torch.tensor(np.asarray(X, dtype="float32"))).squeeze(1)).numpy()
        return np.c_[1 - p, p]


def run(city_id: str = "kolkata") -> dict:
    city = get_city(city_id)
    path = city.processed() / "susceptibility_table.parquet"
    df = pd.read_parquet(path)
    feats = all_hazard_features()
    train = df[df.role.isin(["positive", "background"]) & (df.split == "train")].reset_index(drop=True)
    X, y, g = train[feats], train.label.to_numpy(), train.block_id.to_numpy()
    pw = float(min((y == 0).sum() / max(y.sum(), 1), 30.0))
    est = pipe(TorchMLP(pos_weight=pw))
    oof = oof_predict(est, X, y, g, spatial=True)
    s = score(y, oof)
    s["ci95_block_bootstrap"] = cluster_bootstrap(y, oof, g, n_boot=500)
    out = {"spatial_cv": s, "curves": curves(y, oof)}
    log_experiment("advanced_models", f"sus_{city_id}_torch_mlp_spatialcv",
                   {"city": city_id, "dataset_version": dataset_version(path), "model": "torch_mlp",
                    "features": feats, "random_seed": SEED,
                    "hyperparameters": est.named_steps["model"].get_params(),
                    "validation": "StratifiedGroupKFold(5) by 2 km block (same folds as baselines)", "metrics": s,
                    "note": "Deep spatiotemporal architectures (ConvLSTM/GNN/Transformer) were not trained: 75 "
                            "positive cells and ~24 documented event days cannot support them."})
    (city.processed() / "susceptibility_torch_mlp.json").write_text(json.dumps(out, indent=1))
    log.info("torch MLP spatial-CV ROC-AUC %.3f PR-AUC %.3f", s["roc_auc"], s["pr_auc"])
    return out


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
