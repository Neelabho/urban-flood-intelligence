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

Reporting bias; positional uncertainty; DSM instead of DTM; no drainage network; small samples; no cross-city test;
CHIRPS/ERA5 under-represent extremes; IMERG restricted to case studies; OSM completeness varies.
