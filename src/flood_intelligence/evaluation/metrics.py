"""Classification / probability metrics, curves and cluster-bootstrap confidence intervals."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)


def expected_calibration_error(y, p, bins: int = 10) -> float:
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    idx = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, bins - 1)
    ece = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            ece += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(ece)


def best_f1_threshold(y, p) -> float:
    pr, rc, th = precision_recall_curve(y, p)
    f1 = 2 * pr * rc / np.maximum(pr + rc, 1e-12)
    return float(th[np.nanargmax(f1[:-1])]) if len(th) else 0.5


def threshold_metrics(y, p, thr: float) -> dict:
    yhat = (p >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, yhat, labels=[0, 1]).ravel()
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    spec = tn / (tn + fp) if tn + fp else 0.0
    return {"threshold": float(thr), "precision": float(prec), "recall": float(rec), "specificity": float(spec),
            "f1": float(2 * prec * rec / (prec + rec)) if prec + rec else 0.0,
            "balanced_accuracy": float((rec + spec) / 2), "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]]}


def score(y, p, thr: float | None = None) -> dict:
    y, p = np.asarray(y), np.asarray(p)
    probabilistic = bool(np.nanmin(p) >= 0 and np.nanmax(p) <= 1)
    out = {"n": int(len(y)), "n_pos": int(y.sum()), "prevalence": float(y.mean()),
           "roc_auc": float(roc_auc_score(y, p)), "pr_auc": float(average_precision_score(y, p)),
           # Brier/ECE are only defined for probabilities (non-learned index baselines are scores)
           "brier": float(brier_score_loss(y, p)) if probabilistic else None,
           "ece": expected_calibration_error(y, p) if probabilistic else None}
    out["pr_auc_lift"] = out["pr_auc"] / out["prevalence"]
    out.update(threshold_metrics(y, p, best_f1_threshold(y, p) if thr is None else thr))
    return out


def curves(y, p, n: int = 60) -> dict:
    fpr, tpr, _ = roc_curve(y, p)
    pr, rc, _ = precision_recall_curve(y, p)
    k = np.linspace(0, len(fpr) - 1, min(n, len(fpr))).astype(int)
    j = np.linspace(0, len(pr) - 1, min(n, len(pr))).astype(int)
    q = np.quantile(p, np.linspace(0, 1, 11))
    q[0], q[-1] = -np.inf, np.inf
    idx = np.clip(np.searchsorted(q, p, side="right") - 1, 0, 9)
    cal = [{"mean_pred": float(p[idx == b].mean()), "obs_freq": float(y[idx == b].mean()), "n": int((idx == b).sum())}
           for b in range(10) if (idx == b).any()]
    return {"roc": {"fpr": fpr[k].round(4).tolist(), "tpr": tpr[k].round(4).tolist()},
            "pr": {"recall": rc[j].round(4).tolist(), "precision": pr[j].round(4).tolist()}, "calibration": cal}


def cluster_bootstrap(y, p, groups, n_boot: int = 1000, seed: int = 0, thr: float | None = None) -> dict:
    """Percentile CIs resampling spatial blocks (clusters) with replacement."""
    rng = np.random.default_rng(seed)
    y, p, groups = np.asarray(y), np.asarray(p), np.asarray(groups)
    ug = np.unique(groups)
    members = {g: np.flatnonzero(groups == g) for g in ug}
    vals: dict[str, list] = {"roc_auc": [], "pr_auc": [], "brier": [], "recall": [], "precision": []}
    for _ in range(n_boot):
        idx = np.concatenate([members[g] for g in rng.choice(ug, len(ug), replace=True)])
        yy, pp = y[idx], p[idx]
        if yy.sum() < 2 or yy.sum() == len(yy):
            continue
        vals["roc_auc"].append(roc_auc_score(yy, pp))
        vals["pr_auc"].append(average_precision_score(yy, pp))
        vals["brier"].append(brier_score_loss(yy, pp))
        if thr is not None:
            tm = threshold_metrics(yy, pp, thr)
            vals["recall"].append(tm["recall"])
            vals["precision"].append(tm["precision"])
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in vals.items() if v}


def paired_cluster_bootstrap(y, p_a, p_b, groups, n_boot: int = 1000, seed: int = 0) -> dict:
    """Difference (b - a) in ROC-AUC / PR-AUC for two score vectors on the same rows, resampling the same
    spatial blocks for both; returns the point difference, a 95% percentile CI and P(b > a) over resamples."""
    rng = np.random.default_rng(seed)
    y, p_a, p_b, groups = (np.asarray(v) for v in (y, p_a, p_b, groups))
    ug = np.unique(groups)
    members = {g: np.flatnonzero(groups == g) for g in ug}
    fns = {"roc_auc": roc_auc_score, "pr_auc": average_precision_score}
    diffs: dict[str, list] = {k: [] for k in fns}
    for _ in range(n_boot):
        idx = np.concatenate([members[g] for g in rng.choice(ug, len(ug), replace=True)])
        yy = y[idx]
        if yy.sum() < 2 or yy.sum() == len(yy):
            continue
        for k, fn in fns.items():
            diffs[k].append(fn(yy, p_b[idx]) - fn(yy, p_a[idx]))
    return {k: {"diff": float(fn(y, p_b) - fn(y, p_a)),
                "ci95": [float(np.percentile(diffs[k], 2.5)), float(np.percentile(diffs[k], 97.5))],
                "p_b_better": float(np.mean(np.asarray(diffs[k]) > 0))} for k, fn in fns.items()}
