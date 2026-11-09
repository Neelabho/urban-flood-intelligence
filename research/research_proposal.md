# Research proposal

**Working title:** *Learning where cities waterlog from what gets reported: bias-aware, spatially validated urban flood
susceptibility for Kolkata, with a negative result for satellite radar labels*

## 1. Problem

Kolkata waterlogs almost every monsoon, yet there is no open, systematic record of where and when. Satellite products
that work for riverine floods do not see short-lived street flooding, and the urban flood-susceptibility literature
typically trains on inventories of unknown provenance and validates with random splits. Decision-makers need maps whose
evidence, uncertainty and limits are explicit.

## 2. Objectives

1. Build a reproducible, provenance-tracked dataset integrating terrain, hydrology, land cover, infrastructure, rainfall
   and documented waterlogging reports for Kolkata.
2. Test whether Sentinel-1 change detection can label urban waterlogging (RQ7).
3. Estimate relative susceptibility with bias-aware sampling and spatially blocked, held-out and temporal validation
   (RQ1, RQ4).
4. Quantify which rainfall products and information horizons discriminate documented event days (RQ2, RQ3).
5. Communicate uncertainty separately from susceptibility (RQ5) and interpret features without causal over-claiming (RQ6).

## 3. Preliminary results (this repository)

* SAR change detection shows no rainfall-driven open-water signal in built-up cells (258 pairs; ρ = −0.21).
* Under 2 km block CV, tree ensembles rank documented localities with ROC-AUC 0.87–0.90 (PR-AUC 15–17× prevalence);
  an untouched test set gives 0.86 [0.63–0.97]; localities first documented in 2025–26 are ranked at 0.88.
* A bare-terrain index scores below chance (0.40); DSM-derived "terrain" features act largely as urban-form proxies.
* IMD, CHIRPS and ERA5 discriminate documented event days similarly (ROC-AUC 0.88–0.91, overlapping CIs).
* Skill depends on same-day rainfall: ROC-AUC 0.74 with ≤ 6 h cut-off, 0.57 [0.43–0.79] at 24 h.

## 4. Proposed next steps (to make the work publishable)

| Step | Purpose | Data / effort |
|---|---|---|
| Expand the inventory systematically (all accessible archives 2016–2026, Bengali-language press, KMC releases) with double coding | Reduce reporting bias, enable inter-rater reliability | 2–4 weeks manual work |
| Obtain a bare-earth DEM (FABDEM, CC BY-NC-SA, non-commercial) or LiDAR | Separate topography from building form | licence review |
| Request KMC pumping-station rain-gauge and sensor records | Sub-daily rainfall and point waterlogging observations | institutional request |
| Replicate in Mumbai with the same pipeline | Independent cross-city transfer test | ~1 week compute + inventory |
| Add drainage network proxies (sewer age, pumping catchments) if obtainable | First-order hydraulic control | depends on access |
| Pre-register model choice and metrics before re-running on expanded labels | Guard against analytic flexibility | — |
| Field validation with residents / ward offices (sample of high vs low cells) | Independent ground truth | small survey |

## 5. Expected contribution (hypotheses, not claims)

* A transparent, reusable protocol for building waterlogging inventories from public reports with provenance.
* Evidence that spatial validation and target-group background matter for urban flood ML.
* A documented negative result on Sentinel-1 for urban waterlogging labels in a low-relief megacity.
* An open, inspectable platform demonstrating uncertainty-aware communication.

## 6. Risks

Reporting bias may dominate the signal; DSM artefacts confound terrain; small sample sizes widen CIs; access to
municipal data is uncertain. Each is measurable and is reported rather than hidden.

## 7. Ethics and data

Only public data; news reports used for facts (locality names, dates) with citations; no personal data; outputs framed
to avoid stigmatising neighbourhoods (relative, uncertain, not property-level).
