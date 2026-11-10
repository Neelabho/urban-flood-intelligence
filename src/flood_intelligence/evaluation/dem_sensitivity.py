"""Bare-earth DEM sensitivity analysis (GitHub issue #2; technical report section 3).

Question: Module A's terrain features come from Copernicus GLO-30, a *surface* model that includes buildings and
trees. Is the terrain signal in the susceptibility model topography, or urban form (building-edge texture)?

Design: recompute the twelve terrain features with FABDEM V1-2 (GLO-30 with buildings and forest removed by
machine learning; Hawker et al. 2022), resampled onto the identical 30 m grid, with the same channel burning and
the same pysheds routing. Swap only the terrain columns in the susceptibility table; keep cells, labels, spatial
blocks, the held-out test split and the tuned XGBoost hyperparameters fixed. Compare both DEMs with:

  * DEM difference (DSM - DTM) by built-up fraction (what FABDEM actually removed)
  * per-feature agreement (Spearman rank correlation on urban cells)
  * tuned XGBoost and random forest: spatial-CV OOF and held-out test blocks, with paired block-bootstrap CIs
    for the FABDEM - GLO-30 difference
  * terrain-only XGBoost and the non-learned terrain index
  * global mean |SHAP| ranks of terrain features

FABDEM is CC BY-NC-SA 4.0 (non-commercial): the raster stays under data/raw (git-ignored); only code and
summary statistics are committed.

Run (after `python -m flood_intelligence.ingestion.static_layers kolkata --fabdem`):
    python -m flood_intelligence.evaluation.dem_sensitivity kolkata
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import rasterio
from scipy.stats import spearmanr
from sklearn.base import clone

from ..config import get_city, get_logger, make_grid, save_json
from ..features.labels import HAZARD_FEATURES, all_hazard_features
from ..features.static_features import terrain, terrain_inputs
from ..models.common import SEED, oof_predict, pipe
from ..models.registry import dataset_version, log_experiment
from ..models.susceptibility import model_zoo, physical_index
from .metrics import cluster_bootstrap, paired_cluster_bootstrap, score

log = get_logger(__name__)
TERRAIN = HAZARD_FEATURES["terrain"]
BUILT_BINS = [0.0, 0.25, 0.5, 0.75, 1.0001]


def fabdem_terrain(city) -> pd.DataFrame:
    """Terrain features from FABDEM on the analysis grid (cached in data/processed/<city>/)."""
    cache = city.processed() / "static_terrain_fabdem.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    path = city.raw("elevation") / "fabdem_v1_2_utm30m.tif"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing: run `python -m flood_intelligence.ingestion.static_layers "
                                f"{city.id} --fabdem` first")
    grid = make_grid(city)
    F = terrain(city, grid, *terrain_inputs(city), dem_path=path)
    rows, cols = np.meshgrid(np.arange(grid.height), np.arange(grid.width), indexing="ij")
    df = pd.DataFrame({"cell_id": (rows * grid.width + cols).ravel()})
    for k in TERRAIN + ["dem_void_frac"]:
        df[k] = np.asarray(F[k], dtype="float32").ravel()
    df.to_parquet(cache, index=False)
    return df


def dem_difference(city, static: pd.DataFrame) -> dict:
    """DSM - DTM at 30 m, and the 250 m mean difference by built-up fraction class."""
    with rasterio.open(city.raw("elevation") / "copernicus_glo30_dem_utm30m.tif") as f:
        dsm = f.read(1).astype("float64")
    with rasterio.open(city.raw("elevation") / "fabdem_v1_2_utm30m.tif") as f:
        dtm = f.read(1).astype("float64")
    d = dsm - dtm
    d = d[np.isfinite(d) & (dsm > -50)]
    out = {"pixels_30m": int(d.size), "mean_m": float(d.mean()), "median_m": float(np.median(d)),
           "p95_m": float(np.percentile(d, 95)), "share_changed_gt_0_5m": float((np.abs(d) > 0.5).mean())}
    s = static[["lc_built_frac", "elev_mean_glo30", "elev_mean_fabdem"]].dropna()
    s = s.assign(diff=s.elev_mean_glo30 - s.elev_mean_fabdem,
                 built=pd.cut(s.lc_built_frac, BUILT_BINS, include_lowest=True, right=False))
    out["by_built_fraction_250m"] = [{"built_frac": str(k), "n_cells": int(len(g)), "mean_diff_m": float(g["diff"].mean()),
                                      "median_diff_m": float(g["diff"].median())}
                                     for k, g in s.groupby("built", observed=True)]
    return out


def feature_agreement(glo: pd.DataFrame, fab: pd.DataFrame, urban: np.ndarray) -> dict:
    out = {}
    for f in TERRAIN:
        a, b = glo[f].to_numpy()[urban], fab[f].to_numpy()[urban]
        ok = np.isfinite(a) & np.isfinite(b)
        out[f] = {"spearman_urban": float(spearmanr(a[ok], b[ok]).statistic),
                  "mean_glo30": float(np.nanmean(a)), "mean_fabdem": float(np.nanmean(b)),
                  "missing_glo30": int(np.isnan(a).sum()), "missing_fabdem": int(np.isnan(b).sum())}
    return out


def _shap_terrain_ranks(model, X: pd.DataFrame, feats: list[str], urban: np.ndarray) -> list[dict]:
    import shap
    from sklearn.pipeline import Pipeline

    pre = Pipeline(model.steps[:-1])
    Z = pre.transform(X)
    zcols = feats + [f"missing_{c}" for c in np.array(feats)[model.named_steps["impute"].indicator_.features_]]
    sv = np.asarray(shap.TreeExplainer(model.named_steps["model"]).shap_values(Z))
    mean_abs = np.abs(sv[urban]).mean(0)
    order = np.argsort(-mean_abs)
    return [{"rank": int(r + 1), "feature": zcols[i], "mean_abs_shap": float(mean_abs[i])}
            for r, i in enumerate(order) if zcols[i] in TERRAIN or zcols[i].removeprefix("missing_") in TERRAIN]


def evaluate(tbl: pd.DataFrame, full: pd.DataFrame, feats: list[str], xgb, rf) -> dict:
    """Same folds, same split, same hyperparameters; returns metrics and the raw OOF / test scores."""
    train = tbl[tbl.split == "train"].reset_index(drop=True)
    test = tbl[tbl.split == "test"].reset_index(drop=True)
    Xtr, ytr, gtr = train[feats], train.label.to_numpy(), train.block_id.to_numpy()
    Xte, yte, gte = test[feats], test.label.to_numpy(), test.block_id.to_numpy()
    r: dict = {"_oof": {}, "_test": {}}
    for name, m in (("xgboost_tuned", xgb), ("random_forest", rf)):
        log.info("  %s", name)
        oof = oof_predict(pipe(m), Xtr, ytr, gtr)
        p_te = pipe(m).fit(Xtr, ytr).predict_proba(Xte)[:, 1]
        thr = score(ytr, oof)["threshold"]
        s_cv, s_te = score(ytr, oof), score(yte, p_te, thr=thr)
        s_cv["ci95_block_bootstrap"] = cluster_bootstrap(ytr, oof, gtr, n_boot=500)
        s_te["ci95_block_bootstrap"] = cluster_bootstrap(yte, p_te, gte, n_boot=1000, thr=thr)
        r[name] = {"spatial_cv": s_cv, "holdout_test": s_te}
        r["_oof"][name], r["_test"][name] = oof, p_te
    oof_t = oof_predict(pipe(xgb), Xtr[TERRAIN], ytr, gtr)
    r["xgboost_terrain_only"] = {"spatial_cv": score(ytr, oof_t)}
    r["_oof"]["xgboost_terrain_only"] = oof_t
    r["physical_terrain_index"] = {"train": score(ytr, physical_index(train)), "test": score(yte, physical_index(test))}
    labelled = full[full.role.isin(["positive", "background"])]
    final = pipe(xgb).fit(labelled[feats], labelled.label.to_numpy())
    r["shap_terrain_ranks_urban"] = _shap_terrain_ranks(final, full[feats], feats, full.urban_domain.to_numpy())
    r["_y"] = {"train": ytr, "test": yte}
    r["_groups"] = {"train": gtr, "test": gte}
    return r


def _public(r: dict) -> dict:
    return {k: v for k, v in r.items() if not k.startswith("_")}


def run(city_id: str = "kolkata") -> dict:
    city = get_city(city_id)
    path = city.processed() / "susceptibility_table.parquet"
    base = pd.read_parquet(path)
    sus = json.loads((city.processed() / "susceptibility_results.json").read_text())
    gbest = sus["selection"]["xgb_tuned"]
    fab = fabdem_terrain(city).set_index("cell_id").reindex(base.cell_id).reset_index()
    alt = base.copy()
    for f in TERRAIN:
        alt[f] = fab[f].to_numpy()

    feats = all_hazard_features()
    lab = base.role.isin(["positive", "background"]).to_numpy()
    ytr_all = base.loc[lab & (base.split == "train").to_numpy(), "label"].to_numpy()
    pos_weight = float((ytr_all == 0).sum() / max((ytr_all == 1).sum(), 1))
    zoo = model_zoo(pos_weight)
    xgb = clone(zoo["xgboost"]).set_params(max_depth=gbest["max_depth"], n_estimators=gbest["n_estimators"])
    rf = zoo["random_forest"]

    res: dict = {}
    for name, df in (("glo30_dsm", base), ("fabdem_dtm", alt)):
        log.info("evaluating terrain from %s", name)
        res[name] = evaluate(df[lab].reset_index(drop=True), df, feats, xgb, rf)

    g, f_ = res["glo30_dsm"], res["fabdem_dtm"]
    paired = {}
    for m in ("xgboost_tuned", "random_forest", "xgboost_terrain_only"):
        paired[f"{m}_spatial_cv"] = paired_cluster_bootstrap(g["_y"]["train"], g["_oof"][m], f_["_oof"][m],
                                                             g["_groups"]["train"], n_boot=1000, seed=SEED)
    for m in ("xgboost_tuned", "random_forest"):
        paired[f"{m}_holdout_test"] = paired_cluster_bootstrap(g["_y"]["test"], g["_test"][m], f_["_test"][m],
                                                               g["_groups"]["test"], n_boot=1000, seed=SEED)
    urban = base.urban_domain.to_numpy()
    static = base[["lc_built_frac"]].assign(elev_mean_glo30=base.elev_mean, elev_mean_fabdem=alt.elev_mean)
    out = {
        "question": "Does Module A's terrain signal come from topography or from buildings in the GLO-30 DSM?",
        "design": "terrain features recomputed from FABDEM V1-2 on the identical 30 m grid; cells, labels, spatial "
                  "blocks, held-out test split and tuned hyperparameters fixed; only terrain columns differ",
        "hyperparameters_xgboost": gbest,
        "dem_difference": dem_difference(city, static),
        "feature_agreement": feature_agreement(base, alt, urban),
        "results": {k: _public(v) for k, v in res.items()},
        "paired_difference_fabdem_minus_glo30": paired,
        "fabdem_licence": "CC BY-NC-SA 4.0 (non-commercial); raster not redistributed",
    }
    out["summary"] = _summary(out)
    save_json(out, city.processed() / "dem_sensitivity_results.json")
    log_experiment("dem_sensitivity", f"sus_{city_id}_bare_earth_dem",
                   {"dataset_version": dataset_version(path), "city": city_id, "features": feats,
                    "random_seed": SEED, "model": "xgboost (tuned) + random_forest", "hyperparameters": gbest,
                    "validation": "StratifiedGroupKFold(5) by 2 km block on train split; untouched test blocks; "
                                  "paired block bootstrap (1000) for FABDEM - GLO-30 differences",
                    "metrics": {k: out[k] for k in ("dem_difference", "feature_agreement", "results",
                                                    "paired_difference_fabdem_minus_glo30", "summary")}})
    log.info("%s", json.dumps(out["summary"], indent=2))
    return out


def _summary(o: dict) -> dict:
    r, p = o["results"], o["paired_difference_fabdem_minus_glo30"]

    def m(dem, model, part, k):
        return round(r[dem][model][part][k], 3)

    return {
        dem: {"xgb_cv_roc": m(dem, "xgboost_tuned", "spatial_cv", "roc_auc"),
              "xgb_cv_pr": m(dem, "xgboost_tuned", "spatial_cv", "pr_auc"),
              "xgb_test_roc": m(dem, "xgboost_tuned", "holdout_test", "roc_auc"),
              "xgb_test_pr": m(dem, "xgboost_tuned", "holdout_test", "pr_auc"),
              "rf_cv_roc": m(dem, "random_forest", "spatial_cv", "roc_auc"),
              "rf_cv_pr": m(dem, "random_forest", "spatial_cv", "pr_auc"),
              "terrain_only_cv_roc": m(dem, "xgboost_terrain_only", "spatial_cv", "roc_auc"),
              "terrain_only_cv_pr": m(dem, "xgboost_terrain_only", "spatial_cv", "pr_auc"),
              "terrain_index_train_roc": m(dem, "physical_terrain_index", "train", "roc_auc")}
        for dem in r
    } | {"paired_ci95_pr_auc": {k: [round(x, 3) for x in v["pr_auc"]["ci95"]] for k, v in p.items()},
         "paired_ci95_roc_auc": {k: [round(x, 3) for x in v["roc_auc"]["ci95"]] for k, v in p.items()}}


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
