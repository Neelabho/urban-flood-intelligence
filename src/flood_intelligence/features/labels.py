"""Assemble the susceptibility modelling table: documented positives, target-group background, splits.

Label semantics (shown verbatim in the application):
  positive   = a 250 m cell containing a locality that a cited report names as waterlogged/inundated
  background = an urban cell (same reporting domain) at least BUFFER_CELLS cells from any positive;
               *not* a verified "never floods" observation - absence of a report is not absence of flooding
  excluded   = buffer ring around positives (positional uncertainty), non-urban cells, permanent water

Splits (fixed seeds, written to the table so every experiment uses identical folds):
  block_id     2 km x 2 km spatial blocks (8 x 8 cells) used for grouped spatial cross-validation
  split        'test' for ~20 % of blocks (stratified on positives) held out from all model selection
  temporal_set 'train_period' if the locality was first documented before 2025, else 'test_period'
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from pyproj import Transformer

from ..config import get_city, get_logger, make_grid, save_json

log = get_logger(__name__)
BLOCK_CELLS = 8
BUFFER_CELLS = 2
URBAN_BUILT_FRAC = 0.25
TEST_FRAC = 0.2
SEED = 42

HAZARD_FEATURES = {
    "terrain": ["elev_mean", "elev_min", "elev_std", "slope_mean", "hand_mean", "hand_min", "twi_mean",
                "log_flowacc_max", "depression_depth_mean", "depression_frac_gt05m", "relelev_1km", "relelev_2km"],
    "hydrology": ["dist_waterway_m", "dist_drain_canal_m", "dist_hooghly_m", "dist_perm_water_m",
                  "drain_canal_density_km_km2", "osm_waterbody_frac", "jrc_occurrence_mean", "sar_water_occurrence"],
    "urban": ["lc_built_frac", "lc_tree_frac", "lc_grass_frac", "lc_crop_frac", "lc_water_frac",
              "road_density_km_km2", "sar_vv_mean_db", "sar_vv_temporal_std_db"],
}
EXPOSURE_FEATURES = ["population", "osm_building_count", "road_density_km_km2", "facilities_health",
                     "facilities_education", "facilities_emergency"]


def all_hazard_features() -> list[str]:
    return [f for g in HAZARD_FEATURES.values() for f in g]


def run(city_id: str = "kolkata") -> pd.DataFrame:
    city = get_city(city_id)
    grid = make_grid(city)
    feats = pd.read_parquet(city.processed() / "static_features.parquet")
    geo = pd.read_csv(city.interim() / "documented_localities_geocoded.csv")
    rep = pd.read_csv(city.raw("flood_observations") / "documented_waterlogging_reports.csv")
    geo = geo[geo["geocoded"]].copy()
    t = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    gx, gy = t.transform(geo["lon"].values, geo["lat"].values)
    geo["col"] = np.floor((gx - grid.transform.c) / grid.res).astype(int)
    geo["row"] = np.floor((grid.transform.f - gy) / grid.res).astype(int)
    inside = (geo.col >= 0) & (geo.col < grid.width) & (geo.row >= 0) & (geo.row < grid.height)
    log.info("%d geocoded localities, %d inside grid", len(geo), int(inside.sum()))
    geo = geo[inside]
    stats = rep.groupby("locality").agg(n_reports=("source_url", "nunique"), n_events=("event_date", "nunique"),
                                        first_event=("event_date", "min"), last_event=("event_date", "max"))
    geo = geo.join(stats, on="locality")
    geo["cell_id"] = geo.row * grid.width + geo.col
    geo.to_csv(city.processed() / "documented_localities_cells.csv", index=False)

    pos = geo.groupby("cell_id").agg(n_localities=("locality", "count"), n_events=("n_events", "sum"),
                                     first_event=("first_event", "min"), localities=("locality", "; ".join),
                                     max_uncertainty_m=("uncertainty_m", "max"))
    df = feats.copy()
    df = df.join(pos, on="cell_id")
    df["label"] = df["n_localities"].notna().astype(int)

    # buffer: Chebyshev distance (in cells) to nearest positive
    P = np.zeros(grid.shape, bool)
    P[df.loc[df.label == 1, "row"], df.loc[df.label == 1, "col"]] = True
    from scipy import ndimage
    near = ndimage.binary_dilation(P, structure=np.ones((2 * BUFFER_CELLS + 1,) * 2)) & ~P
    df["in_buffer"] = near[df.row, df.col]
    df["urban_domain"] = (df["lc_built_frac"] >= URBAN_BUILT_FRAC) & ~df["is_water_cell"]
    df["role"] = np.select(
        [df.label == 1, df.in_buffer, ~df.urban_domain],
        ["positive", "excluded_buffer", "excluded_nonurban"], default="background")
    log.info("positives %d (of which outside urban domain %d); background %d", int((df.role == "positive").sum()),
             int(((df.label == 1) & ~df.urban_domain).sum()), int((df.role == "background").sum()))

    df["block_id"] = (df.row // BLOCK_CELLS) * int(np.ceil(grid.width / BLOCK_CELLS)) + (df.col // BLOCK_CELLS)
    model_rows = df[df.role.isin(["positive", "background"])]
    blk = model_rows.groupby("block_id")["label"].sum()
    rng = np.random.default_rng(SEED)
    pos_blocks = blk[blk > 0].index.values
    neg_blocks = blk[blk == 0].index.values
    test_blocks = set(rng.choice(pos_blocks, int(round(TEST_FRAC * len(pos_blocks))), replace=False)) | set(
        rng.choice(neg_blocks, int(round(TEST_FRAC * len(neg_blocks))), replace=False))
    df["split"] = np.where(df.block_id.isin(test_blocks), "test", "train")
    df["temporal_set"] = np.where(df.label == 1, np.where(df["first_event"] < "2025-01-01", "train_period",
                                                          "test_period"), "")
    out = city.processed() / "susceptibility_table.parquet"
    df.to_parquet(out, index=False)
    m = df[df.role.isin(["positive", "background"])]
    summary = {
        "n_cells": len(df), "n_positive_cells": int((df.role == "positive").sum()),
        "n_background_cells": int((df.role == "background").sum()),
        "n_excluded_buffer": int((df.role == "excluded_buffer").sum()),
        "n_excluded_nonurban": int((df.role == "excluded_nonurban").sum()),
        "positives_outside_urban_domain": int(((df.label == 1) & ~df.urban_domain).sum()),
        "train_pos": int(((m.split == "train") & (m.label == 1)).sum()),
        "test_pos": int(((m.split == "test") & (m.label == 1)).sum()),
        "train_bg": int(((m.split == "train") & (m.label == 0)).sum()),
        "test_bg": int(((m.split == "test") & (m.label == 0)).sum()),
        "temporal_train_pos": int((df.temporal_set == "train_period").sum()),
        "temporal_test_pos": int((df.temporal_set == "test_period").sum()),
        "block_cells": BLOCK_CELLS, "buffer_cells": BUFFER_CELLS, "urban_built_frac": URBAN_BUILT_FRAC,
        "test_frac_blocks": TEST_FRAC, "seed": SEED,
    }
    save_json(summary, city.processed() / "susceptibility_table_summary.json")
    log.info("%s", summary)
    return df


if __name__ == "__main__":
    import sys

    run(*(sys.argv[1:2] or ["kolkata"]))
