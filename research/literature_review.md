# Literature review

**Scope.** Urban flood/waterlogging susceptibility, satellite flood detection, ML/DL for flood prediction, explainability,
uncertainty, spatial validation and transfer, with emphasis on Kolkata and Indian cities.

**Method.** Records were retrieved programmatically from OpenAlex (`scripts/research/fetch_literature.py`,
`fetch_literature_targeted.py`) using boolean title/abstract queries sorted by citations, plus targeted title look-ups for
foundational methods. Missing abstracts were filled from Semantic Scholar where available. The full corpus (95 records,
with DOIs and abstracts) is in [`literature_corpus.json`](literature_corpus.json). **Only records in that file are cited.**
Statements about a paper's data, methods or findings are taken from its abstract; where only the title (or a
machine-generated Semantic Scholar TLDR) was available this is marked *(title only)* / *(TLDR)* and no further detail is
claimed. Irrelevant query hits (e.g., arsenic, crop QTLs) were discarded. This is a structured scoping review, not a
systematic review: Google Scholar was not queried programmatically and grey literature is under-represented.

---

## 1. Urban flood susceptibility with machine learning

| Study | Area / data | Methods | Reported finding (from abstract) | Relevance / limitation |
|---|---|---|---|---|
| Zhao et al. 2018, *Sci. Total Environ.* [doi:10.1016/j.scitotenv.2018.12.217](https://doi.org/10.1016/j.scitotenv.2018.12.217) | Beijing; flood inventories 2004–2014; nine meteorological, geographical and anthropogenic factors | Weakly labelled SVM (semi-supervised) | Designed for "limited flood inventories" | Closest in spirit to our weak, incomplete labels; random-split evaluation |
| Rafiei-Sardooi et al. 2021, *IJDRR* [doi:10.1016/j.ijdrr.2021.102614](https://doi.org/10.1016/j.ijdrr.2021.102614) | Jiroft, Iran | ML + TOPSIS multi-criteria | Combines hazard modelling with decision analysis | Small city; hazard/vulnerability mixed |
| Ren et al. 2024, *Remote Sensing* [doi:10.3390/rs16020320](https://doi.org/10.3390/rs16020320) | Mountainous urban area | RF, XGBoost with random sampling strategies | Data-driven methods usable "lacking essential hydrological data", using "limited historical inundation records" | Sampling-strategy sensitivity motivates our background design |
| Wang et al. 2023, *Ecol. Indicators* [doi:10.1016/j.ecolind.2023.111137](https://doi.org/10.1016/j.ecolind.2023.111137) | Shenzhen | XGBoost + SHAP + PDP | Urban morphology influences flooding susceptibility | Supports interpreting surface-model texture as morphology |
| Islam et al. 2020, *Geosci. Frontiers* [doi:10.1016/j.gsf.2020.09.006](https://doi.org/10.1016/j.gsf.2020.09.006) | Flash-flood region (Bangladesh) | Advanced ensemble ML | Ensembles for flash-flood susceptibility | Non-urban; random validation typical |
| Shafizadeh-Moghadam et al. 2018, *J. Environ. Manage.* [doi:10.1016/j.jenvman.2018.03.089](https://doi.org/10.1016/j.jenvman.2018.03.089) | Iran | 8 individual + 7 ensemble models (ANN, CART, FDA, GLM, GAM, BRT, …) | Ensembles compared with individual models | Model-zoo comparison template |
| El-Haddad et al. 2020, *Nat. Hazards* [doi:10.1007/s11069-020-04296-y](https://doi.org/10.1007/s11069-020-04296-y) | Wadi Qena, Egypt | BRT, FDA, GLM, MDA *(TLDR)* | "reasonable accuracy" for all four *(TLDR)* | Arid basin, not urban |
| Razavi-Termeh et al. 2017, *Sci. Total Environ.* [doi:10.1016/j.scitotenv.2017.09.262](https://doi.org/10.1016/j.scitotenv.2017.09.262) | Iran | ANFIS + metaheuristics *(TLDR)* | ANFIS-PSO preferred *(TLDR)* | Hybrid-metaheuristic strand |
| Islam et al. 2025, *Remote Sensing* (review) [doi:10.3390/rs17030524](https://doi.org/10.3390/rs17030524) | Global | Systematic review of RS, ML and other approaches | Urban flooding worsened by urbanisation, impervious expansion and overwhelmed drainage | Frames the problem; confirms drainage data gap |
| Mosavi et al. 2018, *Water* (review) [doi:10.3390/w10111536](https://doi.org/10.3390/w10111536) | Global | Review of ML flood prediction | ML used to "mimic" physical flood processes over two decades | Widely cited baseline review |

**Synthesis.** Tree ensembles (RF, boosted trees) dominate recent urban susceptibility work, usually trained on flood
inventories with randomly sampled "non-flood" points and evaluated with random train/test splits. Abstracts rarely report
spatially blocked validation, label provenance or reporting bias. Semi-supervised (Zhao et al. 2018) and sampling-strategy
studies (Ren et al. 2024) acknowledge incomplete inventories, which is the central issue for Indian cities.

## 2. Kolkata and Indian megacities

| Study | Focus | Notes |
|---|---|---|
| Ghosh, Pal, Maity et al. 2025, *Urban Climate* [doi:10.1016/j.uclim.2025.102451](https://doi.org/10.1016/j.uclim.2025.102451) | ML mapping of stormwater inundation potential, "data-scarce urban areas", Kolkata *(title only)* | Most similar prior work; abstract not retrievable, so its data/validation cannot be compared here |
| Goutham et al. 2025, *JESTR* [doi:10.25103/jestr.186.04](https://doi.org/10.25103/jestr.186.04) | GIS-AHP flood susceptibility for KMC (206 km², 4.6 M people) | Expert-weighted MCDM, no learned model or observation-based validation stated |
| Bose & Mazumdar 2023, *Arab. J. Geosci.* [doi:10.1007/s12517-023-11412-2](https://doi.org/10.1007/s12517-023-11412-2) | InVEST urban flood risk mitigation model, Kolkata *(title only)* | Physically motivated runoff-retention approach |
| Bhaumik & Das 2022, *Environ. Earth Sci.* [doi:10.1007/s12665-022-10330-y](https://doi.org/10.1007/s12665-022-10330-y) | Flow-accumulation models to identify waterlogging on a deltaic plain | Highlights difficulty of gradients on flat terrain |
| Malik et al. 2020, *Urban Climate* [doi:10.1016/j.uclim.2020.100599](https://doi.org/10.1016/j.uclim.2020.100599) | Annual-maximum precipitation trends with GCMs for KMA; links extremes to waterlogging | Climate-side context |
| Alam & Majumder 2022, *Bull. Geogr.* [doi:10.12775/bgeo-2022-0006](https://doi.org/10.12775/bgeo-2022-0006) | Rainfall trend 1901–2020, KMC; "near-annual" pluvial floods | Confirms recurrence |
| Mukhopadhyay et al. 2019, *Epidemiol. Infect.* [doi:10.1017/s0950268819000529](https://doi.org/10.1017/s0950268819000529) | Cholera upsurge after waterlogging, August 2015 | Independent evidence of an event and its impacts |
| Dasgupta et al. 2012, *Climatic Change* [doi:10.1007/s10584-012-0516-3](https://doi.org/10.1007/s10584-012-0516-3) | Kolkata in a changing climate *(title only)* | Policy context |
| Parasuram et al. 2016, *J. Extreme Events* [doi:10.1142/s2345737616500214](https://doi.org/10.1142/s2345737616500214) | Adaptation pathways; "everyday waterlogging" | Social distribution of impacts |
| Krishnachaithanya et al. 2025, *Results Eng.* [doi:10.1016/j.rineng.2025.107872](https://doi.org/10.1016/j.rineng.2025.107872) | Probabilistic flood-risk mapping for Indian megacities in Google Earth Engine; aims to quantify uncertainty | Multi-city ML; transfer claims need independent testing |
| Dhiman et al. 2018, *Appl. Water Sci.* [doi:10.1007/s13201-018-0881-9](https://doi.org/10.1007/s13201-018-0881-9) | Flood risk in Indian coastal cities | Kolkata and Mumbai context |
| Gupta 2007, *Urban Water J.* [doi:10.1080/15730620701464141](https://doi.org/10.1080/15730620701464141) | Mumbai 26 July 2005: 994 mm in 24 h, ≥419 deaths | Benchmark Indian urban flood |
| Zope et al. 2016, *CATENA* [doi:10.1016/j.catena.2016.06.009](https://doi.org/10.1016/j.catena.2016.06.009) | LULC change and flooding, Oshiwara basin, Mumbai *(title only)* | Hydrologic modelling in Mumbai |
| Saharia et al. 2021, *Nat. Hazards* [doi:10.1007/s11069-021-04698-6](https://doi.org/10.1007/s11069-021-04698-6) | India Flood Inventory | Source of event-level records used here |

**Synthesis.** Kolkata studies are mostly MCDM/AHP, physically based (InVEST) or flow-accumulation analyses; one recent
ML study exists (Ghosh et al. 2025) whose validation design we could not inspect. No study we found combines (i) cited,
locality-level waterlogging observations, (ii) spatially blocked and temporal validation, and (iii) explicit treatment of
reporting bias and uncertainty for Kolkata.

## 3. Satellite (SAR) flood detection, especially in cities

* **Automated thresholding/change detection.** Twele et al. 2016 ([doi:10.1080/01431161.2016.1192304](https://doi.org/10.1080/01431161.2016.1192304)) present a fully automated Sentinel-1 near-real-time chain; Clement et al. ([doi:10.1111/jfr3.12303](https://doi.org/10.1111/jfr3.12303)) adapt change detection and thresholding to 13 Sentinel-1 images in Yorkshire comparing VV and VH; Uddin et al. 2019 ([doi:10.3390/rs11131581](https://doi.org/10.3390/rs11131581)) operationalise multi-temporal Sentinel-1 mapping for Bangladesh; Matgen et al. ([doi:10.1016/j.pce.2010.12.009](https://doi.org/10.1016/j.pce.2010.12.009)) propose automated SAR flood monitoring *(TLDR)*; Otsu 1979 ([doi:10.1109/tsmc.1979.4310076](https://doi.org/10.1109/tsmc.1979.4310076)) provides the thresholding criterion; Shen et al. 2019 ([doi:10.3390/rs11070879](https://doi.org/10.3390/rs11070879)) review SAR inundation mapping.
* **Urban limits.** Mason et al. 2009 ([doi:10.1109/tgrs.2009.2029236](https://doi.org/10.1109/tgrs.2009.2029236)) test high-resolution TerraSAR-X in urban Tewkesbury; Mason et al. 2014 ([doi:10.1016/j.jag.2013.12.002](https://doi.org/10.1016/j.jag.2013.12.002)) use double scattering to detect flooded urban areas in high-resolution SAR; Li et al. 2019 ([doi:10.1016/j.isprsjprs.2019.04.014](https://doi.org/10.1016/j.isprsjprs.2019.04.014)) state urban flood detection "still proves to be particularly challenging" and use intensity plus interferometric coherence.
* **Global observational records.** Tellman et al. 2021 ([doi:10.1038/s41586-021-03695-w](https://doi.org/10.1038/s41586-021-03695-w)) map floods from satellites globally and estimate population exposure; Pekel et al. 2016 ([doi:10.1038/nature20584](https://doi.org/10.1038/nature20584)) provide the JRC Global Surface Water record.
* **SAR + ML susceptibility.** Shahabi et al. 2020 ([doi:10.3390/rs12020266](https://doi.org/10.3390/rs12020266)) derive flood inventories from Sentinel-1 for a rural watershed and train bagging-KNN susceptibility models.

**Synthesis.** Sentinel-1 works well for open-surface inundation; dense urban flooding needs high-resolution SAR,
double-bounce modelling or coherence (Mason 2014; Li 2019). For short-lived street waterlogging, the 6–12 day revisit is a
further barrier. *Our own test (Data Observatory) confirms this for Kolkata.*

## 4. Terrain and hydrological descriptors

HAND (Rennó et al. 2008, [doi:10.1016/j.rse.2008.03.018](https://doi.org/10.1016/j.rse.2008.03.018); Nobre et al. 2011,
[doi:10.1016/j.jhydrol.2011.03.051](https://doi.org/10.1016/j.jhydrol.2011.03.051)) and the topographic wetness index (Beven &
Kirkby 1979, [doi:10.1080/02626667909491834](https://doi.org/10.1080/02626667909491834)) are standard susceptibility predictors.
Their reliability depends on DEM quality: Wessel et al. 2018 ([doi:10.1016/j.isprsjprs.2018.02.017](https://doi.org/10.1016/j.isprsjprs.2018.02.017))
report TanDEM-X (the source of Copernicus GLO-30) absolute accuracy against GPS — but surface models include buildings, a
critical issue for urban low-relief areas.

## 5. Rainfall products for India

IMD's 0.25° daily gridded product (Pai et al. 2014, *MAUSAM* [doi:10.54302/mausam.v65i1.851](https://doi.org/10.54302/mausam.v65i1.851);
Pai et al. 2014, *Clim. Dyn.* [doi:10.1007/s00382-014-2307-1](https://doi.org/10.1007/s00382-014-2307-1)) is the gauge standard;
Prakash et al. 2016 ([doi:10.1016/j.jhydrol.2016.01.029](https://doi.org/10.1016/j.jhydrol.2016.01.029)) assess GPM multi-satellite
estimates over the monsoon region; CHIRPS (Funk et al. 2015, [doi:10.1038/sdata.2015.66](https://doi.org/10.1038/sdata.2015.66)) blends
infrared estimates with stations; ERA5 (Hersbach et al. 2020, [doi:10.1002/qj.3803](https://doi.org/10.1002/qj.3803)) is the reanalysis
reference; Yumnam et al. 2021 ([doi:10.1016/j.jhydrol.2021.127206](https://doi.org/10.1016/j.jhydrol.2021.127206)) merge products *(title only)*.
Guptha et al. 2021 ([doi:10.1016/j.rsase.2021.100601](https://doi.org/10.1016/j.rsase.2021.100601)) note that "limited availability of
sub-hourly precipitation" constrains urban drainage analysis in Gurugram — the same constraint holds in Kolkata.

## 6. Deep learning for hydrological prediction

LSTMs outperform conceptual rainfall–runoff models on large-sample basin data (Kratzert et al. 2018,
[doi:10.5194/hess-22-6005-2018](https://doi.org/10.5194/hess-22-6005-2018); 2019 HESS [doi:10.5194/hess-23-5089-2019](https://doi.org/10.5194/hess-23-5089-2019);
2019 WRR, 531 CAMELS basins, ~30 years daily, [doi:10.1029/2019wr026065](https://doi.org/10.1029/2019wr026065)). ConvLSTM and CNN
variants are applied to flood/streamflow forecasting (Moishin et al. 2021, [doi:10.1109/access.2021.3065939](https://doi.org/10.1109/access.2021.3065939);
Dehghani et al. 2023, [doi:10.1016/j.ecoinf.2023.102119](https://doi.org/10.1016/j.ecoinf.2023.102119)). **These successes rely on long,
dense target series (discharge) that do not exist for urban waterlogging in Kolkata**, which is why this project does not
train sequence models on 24 event days.

## 7. Explainability, calibration and uncertainty

SHAP (Lundberg & Lee 2017, [doi:10.48550/arxiv.1705.07874](https://doi.org/10.48550/arxiv.1705.07874)) and TreeSHAP
(Lundberg et al. 2020, [doi:10.1038/s42256-019-0138-9](https://doi.org/10.1038/s42256-019-0138-9)) are widely used in flood
susceptibility (Pradhan et al. 2023, [doi:10.1016/j.gsf.2023.101625](https://doi.org/10.1016/j.gsf.2023.101625); Aydin & İban 2022,
[doi:10.1007/s11069-022-05793-y](https://doi.org/10.1007/s11069-022-05793-y), where elevation, slope and distance to rivers ranked
highest *(TLDR)*). Boosted trees distort probabilities (Niculescu-Mizil & Caruana 2005, [doi:10.1145/1102351.1102430](https://doi.org/10.1145/1102351.1102430));
modern networks are often miscalibrated (Guo et al. 2017, [doi:10.48550/arxiv.1706.04599](https://doi.org/10.48550/arxiv.1706.04599)).
Ensemble approaches are the standard for forecast uncertainty (Wu et al. 2020, [doi:10.1002/wat2.1432](https://doi.org/10.1002/wat2.1432)).

## 8. Spatial validation, sampling bias and transfer

Random cross-validation of spatially structured data underestimates error (Roberts et al., *Ecography*,
[doi:10.1111/ecog.02881](https://doi.org/10.1111/ecog.02881)); spatial validation reveals poor predictive performance hidden by
random splits (Ploton et al. 2020, [doi:10.1038/s41467-020-18321-y](https://doi.org/10.1038/s41467-020-18321-y)); tools and guidance
for block CV and spatial tuning exist (Valavi et al. 2018, [doi:10.1111/2041-210x.13107](https://doi.org/10.1111/2041-210x.13107);
Schratz et al. 2019, [doi:10.1016/j.ecolmodel.2019.06.002](https://doi.org/10.1016/j.ecolmodel.2019.06.002); Meyer et al. 2019,
[doi:10.1016/j.ecolmodel.2019.108815](https://doi.org/10.1016/j.ecolmodel.2019.108815)). For presence-only data, sample
selection bias should be mirrored in the background ("target-group background"; Phillips et al. 2009,
[doi:10.1890/07-2153.1](https://doi.org/10.1890/07-2153.1)). These ecology-born methods are rarely applied in urban flood
susceptibility abstracts we retrieved.

---

## Key gaps carried forward

See [`research_gap_analysis.md`](research_gap_analysis.md).

1. Label provenance and reporting bias are rarely addressed in urban flood ML.
2. Spatially blocked and temporal validation are uncommon; random splits likely inflate reported accuracy.
3. Satellite-derived labels are often assumed to capture urban flooding without testing.
4. Surface-model (DSM) artefacts in urban terrain features are under-discussed.
5. Event-level, rainfall-conditioned validation for Indian cities is scarce because hourly flood labels do not exist publicly.
