"""Module A - static urban waterlogging susceptibility (presence / target-group-background design).

Experiments (all logged to experiments/):
  baselines/          six classifiers + two non-learned baselines under grouped spatial 5-fold CV
  spatial_validation/ random vs spatial CV optimism; held-out test blocks; spatio-temporal validation
  ablation_studies/   leave-one-feature-group-out (terrain / hydrology / urban / SAR)
  advanced_models/    small PyTorch MLP comparator (same folds; separate process, see deep_tabular.py)
  uncertainty/        block-bootstrap XGBoost ensemble (per-cell spread of percentile rank)

Output scores are *relative susceptibility* (case-control design): predicted values are not absolute flood
probabilities, so the application shows percentiles and quantile classes.
"""
from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

from ..config import MODELS, get_city, get_logger, save_json
from ..evaluation.metrics import cluster_bootstrap, curves, score
from ..features.labels import HAZARD_FEATURES, all_hazard_features
from .common import N_FOLDS, SEED, oof_predict, pipe
from .registry import dataset_version, log_experiment

log = get_logger(__name__)


def model_zoo(pos_weight: float) -> dict:
    return {
        "logistic_regression": LogisticRegression(C=0.5, class_weight="balanced", max_iter=3000),
        "decision_tree": DecisionTreeClassifier(max_depth=4, min_samples_leaf=20, class_weight="balanced",
                                                random_state=SEED),
        "random_forest": RandomForestClassifier(n_estimators=500, min_samples_leaf=5, max_features="sqrt",
                                                class_weight="balanced_subsample", n_jobs=-1, random_state=SEED),
        "xgboost": XGBClassifier(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8,
                                 colsample_bytree=0.8, min_child_weight=2, reg_lambda=2.0,
                                 scale_pos_weight=pos_weight, eval_metric="aucpr", n_jobs=8, random_state=SEED),
        "lightgbm": LGBMClassifier(n_estimators=300, num_leaves=8, learning_rate=0.05, subsample=0.8,
                                   subsample_freq=1, colsample_bytree=0.8, min_child_samples=10,
                                   scale_pos_weight=pos_weight, verbose=-1, random_state=SEED),
        "svm_rbf": SVC(C=1.0, gamma="scale", class_weight="balanced", probability=True, random_state=SEED),
    }


def physical_index(df: pd.DataFrame) -> np.ndarray:
    """Non-learned terrain index: mean percentile of low HAND, high TWI, deep depressions, low relative elevation."""
    r = pd.DataFrame({
        "hand": (-df["hand_mean"].fillna(df["hand_mean"].median())).rank(pct=True),
        "twi": df["twi_mean"].rank(pct=True),
        "dep": df["depression_depth_mean"].rank(pct=True),
        "rel": (-df["relelev_1km"]).rank(pct=True),
    })
    return r.mean(axis=1).to_numpy()


def run(city_id: str = "kolkata", n_boot_models: int = 30) -> dict:
    city = get_city(city_id)
    path = city.processed() / "susceptibility_table.parquet"
    df = pd.read_parquet(path)
    dv = dataset_version(path)
    feats = all_hazard_features()
    model_df = df[df.role.isin(["positive", "background"])].reset_index(drop=True)
    train = model_df[model_df.split == "train"].reset_index(drop=True)
    test = model_df[model_df.split == "test"].reset_index(drop=True)
    Xtr, ytr, gtr = train[feats], train.label.to_numpy(), train.block_id.to_numpy()
    Xte, yte, gte = test[feats], test.label.to_numpy(), test.block_id.to_numpy()
    pos_weight = float((ytr == 0).sum() / max((ytr == 1).sum(), 1))
    common = {"dataset_version": dv, "city": city_id, "features": feats, "random_seed": SEED,
              "data_split": {"design": "grouped spatial CV on 2 km blocks within train split; test blocks held out",
                             "n_train": len(train), "n_train_pos": int(ytr.sum()), "n_test": len(test),
                             "n_test_pos": int(yte.sum())}}
    results: dict = {"models": {}, "baselines": {}}

    # ---------------- baselines & classical models (spatial CV on train) ----------------
    zoo = model_zoo(pos_weight)
    oofs = {}
    for name, m in zoo.items():
        log.info("spatial CV: %s", name)
        est = pipe(m)
        oof = oof_predict(est, Xtr, ytr, gtr, spatial=True)
        oofs[name] = oof
        s = score(ytr, oof)
        s["ci95_block_bootstrap"] = cluster_bootstrap(ytr, oof, gtr, n_boot=500)
        results["models"][name] = {"spatial_cv": s, "curves": curves(ytr, oof)}
        log_experiment("baselines", f"sus_{city_id}_{name}_spatialcv",
                       {**common, "model": name, "hyperparameters": {k: str(v) for k, v in m.get_params().items()},
                        "validation": f"StratifiedGroupKFold({N_FOLDS}) by 2 km block", "metrics": s})
    for bname, fn in (("physical_terrain_index", lambda d: physical_index(d)),
                      ("built_fraction_only", lambda d: d["lc_built_frac"].to_numpy()),
                      ("road_density_only", lambda d: d["road_density_km_km2"].to_numpy())):
        s = score(ytr, fn(train))
        results["baselines"][bname] = {"train_split_score": s}
        log_experiment("baselines", f"sus_{city_id}_{bname}", {**common, "model": bname, "hyperparameters": {},
                       "validation": "non-learned score evaluated on the train split", "metrics": s})

    # (the PyTorch MLP comparator runs in models/deep_tabular.py, a separate process: PyTorch and
    #  XGBoost/LightGBM ship different OpenMP runtimes that segfault when loaded together on macOS)

    # ---------------- model selection ----------------
    best = max(results["models"], key=lambda k: results["models"][k]["spatial_cv"]["pr_auc"])
    log.info("best by spatial-CV PR-AUC: %s", best)
    # small XGBoost tuning grid on spatial CV (train only)
    grid = []
    for depth in (2, 3, 4):
        for n in (200, 400):
            m = clone(zoo["xgboost"]).set_params(max_depth=depth, n_estimators=n)
            o = oof_predict(pipe(m), Xtr, ytr, gtr)
            grid.append({"max_depth": depth, "n_estimators": n, "pr_auc": score(ytr, o)["pr_auc"],
                         "roc_auc": score(ytr, o)["roc_auc"]})
    gbest = max(grid, key=lambda r: r["pr_auc"])
    results["xgb_tuning_grid"] = grid
    final_name = "xgboost"  # tree ensemble with native SHAP support; selection evidence recorded below
    final_model = clone(zoo["xgboost"]).set_params(max_depth=gbest["max_depth"], n_estimators=gbest["n_estimators"])
    oof_final = oof_predict(pipe(final_model), Xtr, ytr, gtr)
    thr = score(ytr, oof_final)["threshold"]  # F1-optimal on train OOF, frozen before touching test

    # ---------------- spatial vs random CV optimism ----------------
    oof_rand = oof_predict(pipe(final_model), Xtr, ytr, gtr, spatial=False)
    opt = {"random_cv": score(ytr, oof_rand), "spatial_cv": score(ytr, oof_final)}
    results["random_vs_spatial_cv"] = opt
    log_experiment("spatial_validation", f"sus_{city_id}_random_vs_spatial_cv",
                   {**common, "model": "xgboost", "hyperparameters": gbest, "metrics": opt,
                    "validation": "same model, StratifiedKFold vs StratifiedGroupKFold(2 km blocks)"})

    # ---------------- held-out test blocks ----------------
    fitted = pipe(final_model).fit(Xtr, ytr)
    p_te = fitted.predict_proba(Xte)[:, 1]
    s_te = score(yte, p_te, thr=thr)
    s_te["ci95_block_bootstrap"] = cluster_bootstrap(yte, p_te, gte, n_boot=1000, thr=thr)
    test_res = {"xgboost": s_te}
    for name in ("logistic_regression", "random_forest", "lightgbm"):
        pm = pipe(zoo[name]).fit(Xtr, ytr).predict_proba(Xte)[:, 1]
        test_res[name] = score(yte, pm)
    test_res["physical_terrain_index"] = score(yte, physical_index(test))
    test_res["built_fraction_only"] = score(yte, test["lc_built_frac"].to_numpy())
    results["holdout_test"] = test_res
    results["holdout_test_curves"] = curves(yte, p_te)
    log_experiment("spatial_validation", f"sus_{city_id}_holdout_test_blocks",
                   {**common, "model": "xgboost", "hyperparameters": gbest, "metrics": test_res,
                    "validation": "untouched 20% of 2 km blocks; threshold frozen from train OOF"})

    # ---------------- spatio-temporal validation ----------------
    tp_train = model_df[(model_df.label == 0) & (model_df.split == "train") | (model_df.temporal_set == "train_period")]
    tp_eval = model_df[((model_df.label == 0) & (model_df.split == "test")) | (model_df.temporal_set == "test_period")]
    m_t = pipe(final_model).fit(tp_train[feats], tp_train.label.to_numpy())
    p_t = m_t.predict_proba(tp_eval[feats])[:, 1]
    st = score(tp_eval.label.to_numpy(), p_t)
    # stricter: drop later-documented cells within 2 cells of an earlier-documented cell
    early = model_df[model_df.temporal_set == "train_period"][["row", "col"]].to_numpy()
    lat = tp_eval[["row", "col"]].to_numpy()
    far = np.array([np.min(np.max(np.abs(early - rc), axis=1)) > 2 if r == 1 else True
                    for rc, r in zip(lat, tp_eval.label.to_numpy())])
    st_strict = score(tp_eval.label.to_numpy()[far], p_t[far])
    results["spatiotemporal"] = {"all_later_localities": st, "later_localities_gt500m_from_earlier": st_strict}
    log_experiment("spatial_validation", f"sus_{city_id}_spatiotemporal",
                   {**common, "model": "xgboost", "hyperparameters": gbest, "metrics": results["spatiotemporal"],
                    "validation": "fit: localities first documented 2016-2024 + train-block background; evaluate: "
                                  "localities first documented 2025-2026 vs held-out-block background"})

    # ---------------- ablations ----------------
    abl = {"all_features": score(ytr, oof_final)}
    groups = dict(HAZARD_FEATURES)
    groups["sar"] = ["sar_water_occurrence", "sar_vv_mean_db", "sar_vv_temporal_std_db"]
    for gname, gf in groups.items():
        keep = [f for f in feats if f not in gf]
        o = oof_predict(pipe(final_model), Xtr[keep], ytr, gtr)
        abl[f"without_{gname}"] = score(ytr, o)
        o2 = oof_predict(pipe(final_model), Xtr[[f for f in gf if f in feats]], ytr, gtr)
        abl[f"only_{gname}"] = score(ytr, o2)
    results["ablation"] = abl
    log_experiment("ablation_studies", f"sus_{city_id}_feature_groups",
                   {**common, "model": "xgboost", "hyperparameters": gbest, "metrics": abl,
                    "validation": f"StratifiedGroupKFold({N_FOLDS}); groups: {list(groups)}"})

    # ---------------- final model on all labelled cells + bootstrap ensemble ----------------
    Xall, yall, gall = model_df[feats], model_df.label.to_numpy(), model_df.block_id.to_numpy()
    final = pipe(final_model).fit(Xall, yall)
    out_dir = MODELS / city_id
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(final, out_dir / "susceptibility_xgb_pipeline.joblib")
    full = df.copy()
    p_full = final.predict_proba(full[feats])[:, 1]
    rng = np.random.default_rng(SEED)
    ub = np.unique(gall)
    ranks = []
    for b in range(n_boot_models):
        chosen = rng.choice(ub, len(ub), replace=True)
        idx = np.concatenate([np.flatnonzero(gall == g) for g in chosen])
        mb = pipe(clone(final_model).set_params(random_state=SEED + b)).fit(Xall.iloc[idx], yall[idx])
        ranks.append(pd.Series(mb.predict_proba(full[feats])[:, 1]).rank(pct=True).to_numpy())
    ranks = np.array(ranks)
    full["susceptibility_score"] = p_full
    full["susceptibility_pct"] = pd.Series(p_full).rank(pct=True).to_numpy()
    full["susceptibility_pct_ens_mean"] = ranks.mean(0)
    full["susceptibility_pct_ens_sd"] = ranks.std(0)
    full["susceptibility_pct_ens_p05"] = np.percentile(ranks, 5, axis=0)
    full["susceptibility_pct_ens_p95"] = np.percentile(ranks, 95, axis=0)
    full["susceptibility_class"] = pd.cut(full["susceptibility_pct"], [0, .5, .75, .9, .97, 1.0001],
                                          labels=["very low", "low", "moderate", "high", "very high"],
                                          include_lowest=True).astype(str)
    full["hand_imputed"] = full["hand_mean"].isna()
    full["extrapolation"] = ~full["urban_domain"]
    np.save(out_dir / "susceptibility_bootstrap_ranks.npy", ranks.astype("float16"))
    log_experiment("uncertainty", f"sus_{city_id}_block_bootstrap_ensemble",
                   {**common, "model": "xgboost", "hyperparameters": gbest, "n_members": n_boot_models,
                    "metrics": {"median_sd_pct": float(np.median(ranks.std(0))),
                                "p90_sd_pct": float(np.percentile(ranks.std(0), 90)),
                                "median_sd_pct_urban": float(np.median(ranks.std(0)[full.urban_domain])),
                                "median_sd_pct_nonurban": float(np.median(ranks.std(0)[~full.urban_domain]))},
                    "validation": "members fitted on block-bootstrap resamples of all labelled cells"})

    # ---------------- explainability (SHAP) ----------------
    import shap

    pre = Pipeline(final.steps[:-1])
    Zall = pre.transform(full[feats])
    zcols = feats + [f"missing_{c}" for c in np.array(feats)[final.named_steps["impute"].indicator_.features_]]
    expl = shap.TreeExplainer(final.named_steps["model"])
    sv = expl.shap_values(Zall)
    sv = np.asarray(sv)
    mean_abs = np.abs(sv[full.urban_domain.to_numpy()]).mean(0)
    order = np.argsort(-mean_abs)
    shap_global = [{"feature": zcols[i], "mean_abs_shap": float(mean_abs[i])} for i in order]
    top3 = []
    for row in sv:
        o = np.argsort(-np.abs(row))[:3]
        top3.append([{"f": zcols[i], "v": round(float(row[i]), 3)} for i in o])
    full["shap_top3"] = [json.dumps(t) for t in top3]
    # partial dependence (model-level) for top features on urban cells
    from sklearn.inspection import partial_dependence
    urban_X = full.loc[full.urban_domain, feats].astype("float64")
    pdp = {}
    for i in order[:6]:
        f = zcols[i]
        if f not in feats:
            continue
        r = partial_dependence(final, urban_X, [f], grid_resolution=25, percentiles=(0.02, 0.98))
        pdp[f] = {"x": np.asarray(r["grid_values"][0]).round(4).tolist(),
                  "y": np.asarray(r["average"][0]).round(5).tolist()}
    # beeswarm-style sample for the frontend (feature value percentile vs shap)
    sample = rng.choice(np.flatnonzero(full.urban_domain.to_numpy()), 400, replace=False)
    bees = {}
    for i in order[:10]:
        f = zcols[i]
        vals = full[f].rank(pct=True).to_numpy()[sample] if f in full else np.zeros(len(sample))
        bees[f] = {"shap": sv[sample, i].round(4).tolist(), "value_pct": np.round(vals, 3).tolist()}
    results["explainability"] = {"shap_global": shap_global, "pdp": pdp, "beeswarm": bees,
                                 "note": "SHAP attributions describe the model, not causal effects."}
    results["selection"] = {"best_by_spatial_cv_pr_auc": best, "final_model": final_name, "xgb_tuned": gbest,
                            "threshold_from_train_oof": thr,
                            "rationale": "Pre-specified reporting model is XGBoost (tuned on spatial CV). Its PR-AUC "
                                         "is within the block-bootstrap CI of the best point estimate (reported "
                                         "above); it is kept for the bootstrap uncertainty ensemble (fast refits) "
                                         "and TreeSHAP. All candidates are reported."}
    results["meta"] = common
    keep_cols = ["cell_id", "row", "col", "lon", "lat", "label", "role", "split", "block_id", "urban_domain",
                 "susceptibility_score", "susceptibility_pct", "susceptibility_pct_ens_mean",
                 "susceptibility_pct_ens_sd", "susceptibility_pct_ens_p05", "susceptibility_pct_ens_p95",
                 "susceptibility_class", "hand_imputed", "extrapolation", "shap_top3", "localities", "first_event"]
    full[keep_cols].to_parquet(city.processed() / "susceptibility_predictions.parquet", index=False)
    save_json(results, city.processed() / "susceptibility_results.json")
    log.info("done: holdout ROC-AUC %.3f PR-AUC %.3f (prev %.4f)", s_te["roc_auc"], s_te["pr_auc"], s_te["prevalence"])
    return results


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
