"""Modules B/C - rainfall-conditioned event-day discrimination and lead-time sensitivity (city scale).

Question: on which monsoon days (May-Oct) does Kolkata experience *documented* waterlogging, and how well
do rainfall metrics from three independent products discriminate those days?

Label: 1 on dates with a cited waterlogging report (documented inventory + city-level reports + India Flood
Inventory entries for Kolkata district). Days -1/+1/+2 around an event are excluded (residual-water reports).
All other monsoon days are 0. Because many waterlogging days were never captured by our search, the negative
class is contaminated (positive-unlabelled); discrimination metrics are therefore conservative.

Validation: leave-one-season-out (temporal) cross-validation; year-cluster bootstrap CIs.
Lead-time experiment: ERA5 hourly features computed with information cut off h hours before the end of the
event day. This measures how much skill depends on same-day rainfall. It is NOT an operational flood forecast:
operational use would need forecast rainfall, not reanalysis.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import xarray as xr
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from ..config import get_city, get_logger, save_json
from ..evaluation.metrics import curves, score
from .registry import log_experiment

log = get_logger(__name__)
MONTHS = (5, 6, 7, 8, 9, 10)
IST = pd.Timedelta(hours=5, minutes=30)
LEADS_H = (0, 3, 6, 12, 24, 48)


def event_dates(city) -> pd.DataFrame:
    rep = pd.read_csv(city.raw("flood_observations") / "documented_waterlogging_reports.csv")
    a = rep.groupby("event_date").agg(source_url=("source_url", "first"), n_localities=("locality", "nunique"))
    a["source"] = "documented_report"
    c = pd.read_csv(city.raw("flood_observations") / "documented_event_days_citylevel.csv").set_index("event_date")
    c = c[["source_url"]].assign(n_localities=0, source="citylevel_report")
    ifi = pd.read_csv(city.raw("flood_observations").parent / "india" / "India_Flood_Inventory_v3.csv")
    ifi = ifi[ifi["Districts"].astype(str).str.contains("Kolkata", case=False)]
    ifi["d"] = pd.to_datetime(ifi["Start Date"], dayfirst=True, errors="coerce")
    ifi = ifi[ifi.d >= "2016-01-01"]
    i = pd.DataFrame({"source_url": "https://doi.org/10.5281/zenodo.16994648 (" + ifi["UEI"] + ")",
                      "n_localities": 0, "source": "india_flood_inventory"}, index=ifi.d.dt.strftime("%Y-%m-%d"))
    ev = pd.concat([a, c, i])
    ev = ev[~ev.index.duplicated(keep="first")].sort_index()
    ev.index = pd.to_datetime(ev.index)
    return ev[ev.index.month.isin(MONTHS)]


def _era5_city(city) -> pd.Series:
    e = pd.read_parquet(city.interim() / "rain_era5_hourly.parquet")
    # hour stamp = end of accumulation (UTC); spatial max over the 9 surrounding nodes captures local cells
    return e.groupby("time")["rain_mm"].max().sort_index()


def era5_features(h: pd.Series, days: pd.DatetimeIndex, lead_h: int = 0) -> pd.DataFrame:
    """Features for IST calendar day D, using hours up to (end of D in IST) - lead_h."""
    rows = []
    cs = h.cumsum()
    for d in days:
        end = d + pd.Timedelta(days=1) - IST - pd.Timedelta(hours=lead_h)  # UTC
        w24 = h.loc[end - pd.Timedelta(hours=24) + pd.Timedelta(hours=1): end]
        w48 = h.loc[end - pd.Timedelta(hours=48) + pd.Timedelta(hours=1): end]
        a72 = h.loc[end - pd.Timedelta(hours=120) + pd.Timedelta(hours=1): end - pd.Timedelta(hours=48)]
        r3 = w48.rolling(3).sum()
        r6 = w48.rolling(6).sum()
        rows.append({"date": d, "era5_24h": w24.sum(), "era5_48h": w48.sum(), "era5_max1h": w48.max(),
                     "era5_max3h": r3.max(), "era5_max6h": r6.max(), "era5_antecedent_72h": a72.sum()})
    del cs
    return pd.DataFrame(rows).set_index("date")


def imd_features(city, days) -> pd.DataFrame:
    da = xr.open_dataset(city.interim() / "rain_imd_daily.nc").rain_mm
    lon0, lat0, lon1, lat1 = city.bbox
    sub = da.sel(lat=slice(lat0 - 0.125, lat1 + 0.125), lon=slice(lon0 - 0.125, lon1 + 0.125))
    mx, mn = sub.max(["lat", "lon"]).to_series(), sub.mean(["lat", "lon"]).to_series()
    out = pd.DataFrame(index=days)
    # IMD day D = 08:30 IST D-1 .. 08:30 IST D. IST calendar day D overlaps IMD days D and D+1.
    out["imd_max_cell_48h"] = [mx.get(d, np.nan) + mx.get(d + pd.Timedelta(days=1), np.nan) for d in days]
    out["imd_mean_48h"] = [mn.get(d, np.nan) + mn.get(d + pd.Timedelta(days=1), np.nan) for d in days]
    out["imd_max_cell_day"] = [max(mx.get(d, np.nan), mx.get(d + pd.Timedelta(days=1), np.nan)) for d in days]
    out["imd_antecedent_3d"] = [sum(mn.get(d - pd.Timedelta(days=k), np.nan) for k in (1, 2, 3)) for d in days]
    return out


def chirps_features(city, days) -> pd.DataFrame:
    da = xr.open_dataset(city.interim() / "rain_chirps_daily.nc").rain_mm
    mx, mn = da.max(["lat", "lon"]).to_series(), da.mean(["lat", "lon"]).to_series()
    out = pd.DataFrame(index=days)
    # CHIRPS day = UTC calendar day; IST day D = 18:30 UTC D-1 .. 18:30 UTC D -> use UTC days D-1 and D
    out["chirps_max_cell_48h"] = [mx.get(d - pd.Timedelta(days=1), np.nan) + mx.get(d, np.nan) for d in days]
    out["chirps_mean_48h"] = [mn.get(d - pd.Timedelta(days=1), np.nan) + mn.get(d, np.nan) for d in days]
    out["chirps_antecedent_3d"] = [sum(mn.get(d - pd.Timedelta(days=k), np.nan) for k in (2, 3, 4)) for d in days]
    return out


def loyo(model, X: pd.DataFrame, y: np.ndarray, years: np.ndarray) -> np.ndarray:
    oof = np.full(len(y), np.nan)
    for yr in np.unique(years):
        te = years == yr
        if y[~te].sum() < 3:
            continue
        m = model().fit(X[~te], y[~te])
        oof[te] = m.predict_proba(X[te])[:, 1]
    return oof


def year_bootstrap(y, p, years, n=1000, seed=0) -> dict:
    from sklearn.metrics import average_precision_score, roc_auc_score
    rng = np.random.default_rng(seed)
    uy = np.unique(years)
    auc, ap = [], []
    for _ in range(n):
        idx = np.concatenate([np.flatnonzero(years == g) for g in rng.choice(uy, len(uy))])
        if 1 < y[idx].sum() < len(idx):
            auc.append(roc_auc_score(y[idx], p[idx]))
            ap.append(average_precision_score(y[idx], p[idx]))
    return {"roc_auc": [float(np.percentile(auc, 2.5)), float(np.percentile(auc, 97.5))],
            "pr_auc": [float(np.percentile(ap, 2.5)), float(np.percentile(ap, 97.5))]}


def lr():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.5, class_weight="balanced", max_iter=2000))


def xgb():
    return XGBClassifier(n_estimators=150, max_depth=2, learning_rate=0.05, subsample=0.8, min_child_weight=1,
                         scale_pos_weight=40, eval_metric="aucpr", random_state=42, n_jobs=4)


def run(city_id: str = "kolkata") -> dict:
    city = get_city(city_id)
    ev = event_dates(city)
    days = pd.DatetimeIndex([d for d in pd.date_range("2016-05-01", "2026-10-31") if d.month in MONTHS])
    h = _era5_city(city)
    E = era5_features(h, days)
    D = E.join(imd_features(city, days)).join(chirps_features(city, days))
    D["label"] = D.index.isin(ev.index).astype(int)
    near = set()
    for d in ev.index:
        for k in (-1, 1, 2):
            near.add(d + pd.Timedelta(days=k))
    D["excluded_near_event"] = D.index.isin(list(near)) & (D.label == 0)
    D["year"] = D.index.year
    D = D[~D.excluded_near_event]
    D.to_parquet(city.processed() / "event_day_table.parquet")
    log.info("event-day table: %d days, %d event days", len(D), int(D.label.sum()))
    res: dict = {"n_days": len(D), "n_event_days": int(D.label.sum()),
                 "events": [{"date": d.strftime("%Y-%m-%d"), **{k: (v if not isinstance(v, float) or np.isfinite(v)
                                                                    else None) for k, v in r.items()}}
                            for d, r in ev.iterrows()],
                 "event_days_by_year": D.groupby("year").label.sum().astype(int).to_dict()}

    # ---- RQ2: rainfall products compared on the common period (all three available)
    sets = {"imd_gauge": ["imd_max_cell_48h", "imd_mean_48h", "imd_antecedent_3d"],
            "chirps_satellite": ["chirps_max_cell_48h", "chirps_mean_48h", "chirps_antecedent_3d"],
            "era5_reanalysis_daily": ["era5_48h", "era5_24h", "era5_antecedent_72h"],
            "era5_reanalysis_subdaily": ["era5_max1h", "era5_max3h", "era5_max6h", "era5_48h",
                                         "era5_antecedent_72h"],
            "imd_plus_era5_subdaily": ["imd_max_cell_48h", "imd_antecedent_3d", "era5_max1h", "era5_max3h"]}
    common = D.dropna(subset=[c for s in sets.values() for c in s])
    yC, yrC = common.label.to_numpy(), common.year.to_numpy()
    comp = {}
    for name, cols in sets.items():
        uni = {c: score(yC, common[c].to_numpy()) for c in cols}
        oof = loyo(lr, common[cols], yC, yrC)
        ok = ~np.isnan(oof)
        s = score(yC[ok], oof[ok])
        s["ci95_year_bootstrap"] = year_bootstrap(yC[ok], oof[ok], yrC[ok])
        comp[name] = {"features": cols, "logistic_loyo": s, "univariate": {c: {"roc_auc": u["roc_auc"], "pr_auc": u[
            "pr_auc"]} for c, u in uni.items()}, "curves": curves(yC[ok], oof[ok])}
    res["product_comparison"] = {"period": f"{common.index.min().date()}..{common.index.max().date()}",
                                 "n_days": len(common), "n_event_days": int(yC.sum()), "results": comp}
    log_experiment("baselines", f"dyn_{city_id}_rainfall_product_comparison",
                   {"city": city_id, "model": "logistic_regression", "validation": "leave-one-season-out",
                    "dataset_version": f"{len(common)} days / {int(yC.sum())} events", "random_seed": 42,
                    "features": sets, "metrics": {k: v["logistic_loyo"] for k, v in comp.items()}})

    # ---- threshold baseline: IMD 'heavy rainfall' (>= 64.5 mm/day) at any cell on the event day
    thr = (common["imd_max_cell_day"] >= 64.5).astype(int).to_numpy()
    tp, fp = int(((thr == 1) & (yC == 1)).sum()), int(((thr == 1) & (yC == 0)).sum())
    fn = int(((thr == 0) & (yC == 1)).sum())
    res["imd_heavy_rain_threshold_baseline"] = {"tp": tp, "fp": fp, "fn": fn,
                                                "recall": tp / max(tp + fn, 1), "precision": tp / max(tp + fp, 1)}

    # ---- full-period ERA5 model (2016-2026) + XGBoost comparator
    era_cols = sets["era5_reanalysis_subdaily"]
    y, yrs = D.label.to_numpy(), D.year.to_numpy()
    full = {}
    for mname, mk in (("logistic_regression", lr), ("xgboost_depth2", xgb)):
        oof = loyo(mk, D[era_cols], y, yrs)
        ok = ~np.isnan(oof)
        s = score(y[ok], oof[ok])
        s["ci95_year_bootstrap"] = year_bootstrap(y[ok], oof[ok], yrs[ok])
        full[mname] = s
    res["era5_full_period"] = full
    final = lr().fit(D[era_cols], y)
    D_out = D.copy()
    D_out["p_event_day_insample"] = final.predict_proba(D[era_cols])[:, 1]
    D_out["p_event_day_loyo"] = loyo(lr, D[era_cols], y, yrs)

    # ---- lead-time sensitivity (ERA5 information cut-off)
    lead = {}
    for L in LEADS_H:
        F = era5_features(h, D.index, lead_h=L)
        oof = loyo(lr, F[era_cols], y, yrs)
        ok = ~np.isnan(oof)
        s = score(y[ok], oof[ok])
        s["ci95_year_bootstrap"] = year_bootstrap(y[ok], oof[ok], yrs[ok])
        lead[f"{L}h"] = s
        log.info("lead %dh: ROC-AUC %.3f PR-AUC %.3f", L, s["roc_auc"], s["pr_auc"])
    res["lead_time"] = lead
    log_experiment("advanced_models", f"dyn_{city_id}_lead_time_sensitivity",
                   {"city": city_id, "model": "logistic_regression", "features": era_cols, "random_seed": 42,
                    "validation": "leave-one-season-out; ERA5 information cut-off h hours before end of event day",
                    "dataset_version": f"{len(D)} days / {int(y.sum())} events", "metrics": lead,
                    "note": "Diagnostic of rainfall-information dependence; not an operational forecast."})

    # ---- scenario curve: P(event day) vs 48 h rainfall at fixed intensity profile (simulated scenario)
    coefs = dict(zip(era_cols, final.named_steps["logisticregression"].coef_[0]))
    # unweighted model for the scenario curve so outputs are interpretable as the probability that a day
    # appears in the documented inventory (a lower bound on waterlogging probability, given under-reporting)
    final = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000)).fit(D[era_cols], y)
    scen = []
    med = D[era_cols].median()
    for tot in (0, 10, 25, 50, 75, 100, 150, 200, 250):
        x = med.copy()
        x["era5_48h"] = tot
        x["era5_max1h"] = tot * 0.25
        x["era5_max3h"] = tot * 0.5
        x["era5_max6h"] = tot * 0.7
        scen.append({"rain_48h_mm": tot, "p_event_day": float(final.predict_proba(pd.DataFrame([x]))[:, 1][0])})
    res["scenario_curve"] = {"points": scen, "assumption": "max1h = 25%, max3h = 50%, max6h = 70% of the 48 h total; "
                                                          "antecedent 72 h at its median. Simulated scenario.",
                             "note": "unweighted logistic regression fitted on all seasons: probability that a day "
                                     "is a *documented* waterlogging day (lower bound; many events go unreported)"}
    res["coefficients_standardized"] = {k: float(v) for k, v in coefs.items()}
    sc_, lr_ = final.named_steps["standardscaler"], final.named_steps["logisticregression"]
    res["live_model"] = {"features": era_cols, "mean": sc_.mean_.tolist(), "scale": sc_.scale_.tolist(),
                         "coef": lr_.coef_[0].tolist(), "intercept": float(lr_.intercept_[0]),
                         "trained_on": "ERA5 hourly (max over 9 nodes), May-Oct 2016-2026, documented event days",
                         "output": "probability that the day is a documented waterlogging day (lower bound)"}
    D_out.reset_index().rename(columns={"index": "date"}).to_parquet(city.processed() / "event_day_predictions.parquet")
    save_json(res, city.processed() / "dynamic_results.json")
    return res


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
