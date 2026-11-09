# Paper outline (draft structure — results are preliminary and require the validation steps in research/research_proposal.md)

1. **Abstract** — Problem (unrecorded urban waterlogging), data (12 open sources + cited reports), methods (target-group background, block/temporal validation, event-day models), key results (Section 10), limits.
2. **Introduction** — Kolkata's recurrent pluvial flooding; gap between satellite flood mapping and street waterlogging; need for bias-aware, validated susceptibility.
3. **Related work** — `research/literature_review.md` §1–8.
4. **Study area** — Kolkata Municipal Corporation and surroundings; relief ~10 m; combined sewers and pumping; 250 m grid.
5. **Research questions** — `research/research_questions.md` (RQ1–RQ7).
6. **Datasets** — Table from `data/metadata/dataset_catalog.json`; observation inventory protocol; IFI.
7. **Data preprocessing** — Reprojection/aggregation, stream burning, HAND/TWI, SAR processing, missingness and imputation study.
8. **Methodology** — Presence/background design; model suite; event-day and lead-time design; uncertainty ensemble; SHAP/PDP/ablations.
9. **Experimental setup** — Splits, seeds, folds, metrics (ROC-AUC, PR-AUC with prevalence, Brier, ECE, recall/precision at frozen threshold), bootstrap CIs.
10. **Results** — `reports/technical_report.md` §2–6: (a) SAR negative result; (b) model comparison & spatial vs random CV; (c) held-out & spatio-temporal; (d) ablation & SHAP; (e) rainfall products; (f) lead time; (g) exposure.
11. **Discussion** — DSM features as urban-form proxies; reporting bias; added-area failure mode (Section 7 of the report); implications for municipal planning.
12. **Limitations** — Report §8 plus inventory size and archive bias.
13. **Conclusion** — What can and cannot be claimed (see README "Claims").
14. **References** — Only DOIs in `research/literature_corpus.json`.

**Status of experiments:** complete for Kolkata as described. **Incomplete / not attempted:** cross-city (Mumbai) transfer, bare-earth DEM sensitivity, inter-coder reliability of the inventory, independent field validation, IMERG multi-year comparison.
