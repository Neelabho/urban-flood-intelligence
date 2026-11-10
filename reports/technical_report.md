# UFII technical report — Kolkata pilot

*Generated from experiment records in `experiments/` and `data/processed/kolkata/*.json` (run of 9 Nov 2026,
commit recorded in each JSON). Re-run `scripts/run_pipeline.sh kolkata --skip-download` to regenerate.*

## 1. Summary

| Item | Result |
|---|---|
| Analysis grid | 16,875 cells × 250 m (UTM 45N) |
| Datasets | 12 public sources; 26 logged downloads (≈ 293 MB city subsets + national IMD files) |
| Observations | 132 locality mentions → 83 geocoded localities → 75 positive cells; 24 documented event days (2016–2026); 94 catalogued events incl. archival IFI entries (1975–2015) |
| Best spatial-CV susceptibility model | Random forest ROC-AUC 0.896 [0.83–0.94], PR-AUC 0.197 (17.4× prevalence) |
| Reporting model (XGBoost) held-out test | ROC-AUC 0.858 [0.63–0.97], PR-AUC 0.123 (10.6× prevalence), 16 positives |
| Later-documented localities | ROC-AUC 0.875 (0.833 for localities > 500 m from earlier ones) |
| Event-day discrimination (2016–2025) | IMD 0.905 [0.83–0.97]; CHIRPS 0.881; ERA5 0.885 — no significant difference |
| 24 h information cut-off | ROC-AUC 0.568 [0.43–0.79] — not distinguishable from chance |
| SAR label test | No rainfall-driven new open water in built-up cells (ρ = −0.21) |

## 2. Susceptibility: spatial cross-validation (training split, 59 positives / 5,213 cells)

| Model | ROC-AUC [95% CI] | PR-AUC | Lift | Brier | Recall | Precision | Bal. acc. |
|---|---|---:|---:|---:|---:|---:|---:|
| Random forest | 0.896 [0.83–0.94] | 0.197 | 17.4 | 0.0112 | 0.37 | 0.27 | 0.68 |
| SVM (RBF) | 0.884 [0.82–0.93] | 0.175 | 15.5 | 0.0103 | 0.27 | 0.24 | 0.63 |
| XGBoost (default) | 0.881 [0.81–0.94] | 0.173 | 15.2 | 0.0155 | 0.31 | 0.32 | 0.65 |
| XGBoost (tuned, depth 4 / 200) | 0.888 | 0.183 | — | — | — | — | — |
| LightGBM | 0.866 [0.78–0.93] | 0.160 | 14.2 | 0.0128 | 0.32 | 0.28 | 0.66 |
| MLP (PyTorch) | 0.856 [0.76–0.93] | 0.214 | 18.9 | 0.0187 | 0.22 | 0.38 | 0.61 |
| Logistic regression | 0.841 [0.75–0.91] | 0.093 | 8.2 | 0.1204 | 0.41 | 0.12 | 0.69 |
| Decision tree | 0.748 [0.63–0.84] | 0.054 | 4.7 | 0.0942 | 0.44 | 0.09 | 0.70 |
| *Built-up fraction only* | 0.776 | 0.048 | 4.2 | — | | | |
| *Road density only* | 0.672 | 0.021 | 1.9 | — | | | |
| *Terrain index (HAND/TWI/depressions)* | **0.398** | 0.010 | 0.9 | — | | | |

Prevalence 1.13%. Threshold metrics at the F1-optimal OOF threshold. Accuracy is not reported. Differences between the
top five models lie within overlapping bootstrap intervals.

**Random vs spatial CV (tuned XGBoost):** random ROC-AUC 0.919 / PR-AUC 0.270 vs spatial 0.888 / 0.183 — random
splits overstate PR-AUC by ~48%.

**Held-out test blocks (16 positives / 1,383 cells), threshold 0.597 frozen from training:** confusion matrix
TN 1,345, FP 22, FN 11, TP 5 → recall 0.31, precision 0.19, specificity 0.984. LightGBM 0.879 / 0.278; RF 0.865 / 0.150;
LR 0.852 / 0.126; built-up only 0.694; terrain index 0.458.

## 3. Ablation (XGBoost, spatial CV)

| Variant | ROC-AUC | PR-AUC |
|---|---:|---:|
| All features | 0.888 | 0.183 |
| Without terrain (DSM) | 0.830 | 0.067 |
| Only terrain (DSM) | 0.833 | 0.143 |
| Without hydrology | 0.871 | 0.209 |
| Only hydrology | 0.699 | 0.022 |
| Without urban fabric | 0.861 | 0.147 |
| Only urban fabric | 0.793 | 0.069 |
| Without SAR | 0.880 | 0.164 |
| Only SAR | 0.678 | 0.037 |

Top mean |SHAP| (urban cells): slope, road density, built-up fraction, distance to canals/drains, elevation SD,
distance to waterways, distance to the Hooghly, mean elevation, tree cover, distance to permanent water.

**Interpretation.** DSM slope and elevation SD inside dense neighbourhoods measure building-edge texture; together with
the failure of the bare-terrain index, this suggests the model largely encodes *urban form* associated with reported
waterlogging (old, dense, central fabric with ageing combined sewers), plus proximity to drainage channels. Reporting bias
may contribute. No causal claim is made.

### 3a. Bare-earth DEM sensitivity (FABDEM)

*Source: `experiments/dem_sensitivity/sus_kolkata_bare_earth_dem.json`, produced by
`python -m flood_intelligence.evaluation.dem_sensitivity kolkata` (GitHub issue #2).*

**Design.** The twelve terrain features were recomputed from FABDEM V1-2 (Hawker et al. 2022,
doi:10.1088/1748-9326/ac4d4f). FABDEM is GLO-30 with buildings and forest removed by machine learning. It was resampled
onto the identical 30 m grid and processed with the same channel burning and pysheds routing. Only the terrain columns
change. Cells, labels, 2 km blocks, the held-out test split and the tuned XGBoost hyperparameters (depth 4 / 200) stay
fixed. Re-running the GLO-30 arm reproduces §2–3 exactly (0.888 / 0.183 CV; 0.858 / 0.123 test). FABDEM is licensed
CC BY-NC-SA 4.0, so the raster stays in git-ignored `data/raw/` and only summary statistics are committed. FABDEM
leaves 1.8% of pixels (large water bodies) empty; these take the GLO-30 value, which is ~0 m in both DEMs.

**What FABDEM removed.** DSM − DTM averages 1.9 m (median 1.7 m, p95 5.4 m), and 68% of pixels change by more than
0.5 m. The difference grows with built-up fraction: 1.4 m in cells < 25% built, 2.3 m at 25–50%, 2.7 m at 50–75% and
3.0 m at ≥ 75%. Buildings are what was taken out.

**Feature agreement (Spearman ρ, urban cells, GLO-30 vs FABDEM).** Mean elevation 0.95; relative elevation 0.87 / 0.90;
minimum elevation 0.87; HAND 0.71; TWI 0.61; **slope 0.52; elevation SD 0.52**; depression depth 0.49; share of
depressions > 0.5 m 0.17. Mean DSM slope (1.95°) falls to 0.28° and elevation SD from 1.42 m to 0.32 m. Cells with no
HAND (no D8 path to a channel) rise from 337 to 1,063 on the flatter bare-earth surface; the in-pipeline KNN imputer
fills them, as before.

| Terrain source | XGBoost CV ROC / PR | RF CV ROC / PR | Terrain-only CV ROC / PR | XGBoost test ROC / PR | RF test ROC / PR | Terrain index train / test ROC |
|---|---|---|---|---|---|---|
| GLO-30 DSM | 0.888 / 0.183 | 0.896 / 0.197 | 0.833 / 0.143 | 0.858 / 0.123 | 0.865 / 0.150 | 0.398 / 0.458 |
| FABDEM DTM | 0.884 / 0.201 | 0.874 / 0.175 | 0.853 / 0.140 | 0.790 / 0.063 | 0.738 / 0.058 | 0.431 / 0.478 |

Paired block bootstrap (1,000 resamples) of the FABDEM − GLO-30 difference, 95% CI:

| Comparison | Δ ROC-AUC | Δ PR-AUC |
|---|---|---|
| XGBoost, spatial CV | −0.003 [−0.031, 0.025] | +0.017 [−0.057, 0.077] |
| Random forest, spatial CV | −0.022 [−0.049, 0.000] | −0.022 [−0.094, 0.025] |
| Terrain-only XGBoost, spatial CV | +0.020 [−0.024, 0.070] | −0.003 [−0.080, 0.080] |
| XGBoost, held-out test (16 positives) | −0.068 [−0.132, −0.021] | −0.060 [−0.250, −0.002] |
| Random forest, held-out test | −0.127 [−0.263, −0.029] | −0.093 [−0.311, −0.003] |

At the threshold frozen from training, held-out recall is 0.31 with GLO-30 and 0.06 with FABDEM (1 of 16).

Mean |SHAP| rank (urban cells): with GLO-30, slope is the #1 feature and elevation SD #5. With FABDEM, the top
terrain features are minimum elevation (#5), slope (#6), flow accumulation (#7) and TWI (#9). Slope's mean |SHAP|
falls from 0.95 to 0.38.

**Findings.**
1. *The DSM's top-ranked terrain features were mostly building texture.* Slope and elevation SD agree only weakly
   between the two DEMs (ρ ≈ 0.5) and shrink about five-fold once buildings are removed. DSM slope's #1 SHAP rank does
   not survive. This supports the §3 interpretation.
2. *Bare-earth terrain still carries signal.* Under spatial CV, overall and terrain-only performance do not change
   detectably (all CV differences include 0), so the terrain group is not *only* a proxy for buildings. The model draws
   on bare-earth low points and flow paths (minimum elevation, flow accumulation, TWI) instead.
3. *The DSM generalises better to the held-out test blocks.* The difference excludes 0 for both models. But the test
   set has only 16 positives in one fixed block draw, and the hyperparameters were tuned on DSM features, which favours
   the GLO-30 arm. This is suggestive, not conclusive. If real, urban form itself (dense, old fabric) is a transferable
   predictor of *reported* waterlogging.
4. *The simple "low-lying = floods" terrain index fails on bare earth too* (ROC 0.43 / 0.48). Its failure in §2 was
   not caused by buildings in the DSM.

**Decision.** The production model keeps GLO-30. Removing buildings does not improve cross-validated skill and lowers
held-out skill. Its terrain-feature attributions are now reported as a mix of topography and urban form, not as pure
topography. A surveyed DTM (e.g. KMC/LiDAR), or a larger independent test set, would be needed to settle finding 3.

## 4. Uncertainty

30 block-bootstrap XGBoost members; SD of percentile rank: very high class median 1.4 points, high 6.4, moderate 16.0,
low 18.6, very low 15.2. The ranking's top tier is stable; the middle is not.

## 5. Event-day model and lead time

| Rainfall information (2016-05..2025-10; 16 events / 1,752 days) | ROC-AUC [95% CI] | PR-AUC |
|---|---|---:|
| IMD gauge grid | 0.905 [0.83–0.97] | 0.111 |
| CHIRPS satellite | 0.881 [0.82–0.94] | 0.084 |
| ERA5 daily | 0.885 [0.82–0.96] | 0.198 |
| ERA5 sub-daily intensities | 0.879 [0.83–0.93] | 0.134 |
| IMD + ERA5 sub-daily | 0.908 [0.84–0.97] | 0.135 |
| IMD heavy-rain threshold (≥ 64.5 mm) | recall 0.69, precision 0.11 | |

Full period 2016–2026 (ERA5, 24 events): logistic 0.749 [0.62–0.90]; shallow XGBoost 0.738.

| Information cut-off | 0 h | 3 h | 6 h | 12 h | 24 h | 48 h |
|---|---:|---:|---:|---:|---:|---:|
| ROC-AUC | 0.749 | 0.742 | 0.745 | 0.720 | 0.568 | 0.360 |

## 6. Exposure (potential, not damage)

| Class | Area km² | Population (modelled) | Health facilities |
|---|---:|---:|---:|
| Very low | 527.3 | 3.03 M | 42 |
| Low | 263.7 | 3.68 M | 71 |
| Moderate | 158.2 | 3.69 M | 78 |
| High | 73.8 | 3.25 M | 161 |
| Very high | 31.7 | 1.65 M | 176 |

The two highest classes cover 10% of the area but contain 32% of modelled population and 63% of OSM health facilities
— reflecting that documented waterlogging concentrates in the dense core where facilities also cluster.

## 7. Error analysis (held-out test blocks, verified against model predictions)

* **False negatives (11 of 16 test positives below the frozen threshold).** The four lowest-ranked are in the southern
  and south-western KMC "added areas" — Sarsuna (29th percentile), Shakuntala Park/Behala (51st), Kidderpore (70th),
  Diamond Harbour Road/Joka (74th). The planned eastern township is also missed: Salt Lake Sector V and Sector III
  (88th), Salt Lake (93rd). These areas differ in urban form from the old core that dominates the training positives;
  reports cited in the inventory attribute their waterlogging to drainage gaps in merged wards and canal surcharge
  rather than to the core's combined-sewer constraints. The model under-represents these mechanisms.
* **True positives** are central localities (Theatre Road 99.9th, Exide More 99.6th, Camac Street, Rashbehari Avenue,
  Karunamoyee).
* **False positives (22 cells).** Median built-up fraction 0.97 vs 0.65 for test background, median modelled population
  2,799 vs 714 per cell — i.e., the densest unreported cells. Whether these are unreported waterlogging or model error
  cannot be resolved without independent observations.
* **Event days.** Not analysed per event here; the full-period ERA5 model's lower skill (0.749 vs 0.885 on 2016–2025)
  coincides with the 2026 season, which has 8 events and no IMD data yet.

## 8. Limitations

Reporting bias; positional uncertainty; DSM instead of DTM (sensitivity to a modelled bare-earth DEM in §3a; no surveyed DTM); no drainage network; small samples; no cross-city test;
CHIRPS/ERA5 under-represent extremes; IMERG restricted to case studies; OSM completeness varies.
