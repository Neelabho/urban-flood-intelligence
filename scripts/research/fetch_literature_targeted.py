"""Second pass: look up specific works by title and Kolkata-focused queries; merge into the corpus."""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

from fetch_literature import UA, abstract  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
TITLES = [
    "Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure",
    "A Unified Approach to Interpreting Model Predictions",
    "Spatial validation reveals poor predictive performance of large-scale ecological mapping models",
    "A physically based, variable contributing area model of basin hydrology",
    "High-resolution mapping of global surface water and its long-term changes",
    "Towards an automated SAR-based flood monitoring system: Lessons learned from two case studies",
    "From local explanations to global understanding with explainable AI for trees",
    "XGBoost: A Scalable Tree Boosting System",
    "On Calibration of Modern Neural Networks",
    "Predicting good probabilities with supervised learning",
    "A threshold selection method from gray-level histograms",
    "GPM IMERG Final Precipitation L3 Half Hourly 0.1 degree x 0.1 degree V06",
    "The ERA5 global reanalysis",
    "Urban flooding in Kolkata",
    "Accuracy assessment of the global TanDEM-X Digital Elevation Model with GPS data",
]
KOLKATA = [
    'Kolkata AND waterlogging',
    '"Kolkata Municipal Corporation" AND (flood OR waterlogging OR drainage)',
    'Kolkata AND flood AND (susceptibility OR vulnerability OR risk) AND (GIS OR "remote sensing")',
]


def get(params: dict) -> list[dict]:
    for attempt in range(10):
        r = requests.get("https://api.openalex.org/works", params=params, headers=UA, timeout=60)
        if r.status_code == 429:
            time.sleep(12 + 3 * attempt)
            continue
        r.raise_for_status()
        return r.json()["results"]
    raise RuntimeError("rate limited")


def to_rec(w: dict, topic: str) -> dict:
    return {
        "openalex_id": w["id"].rsplit("/", 1)[-1], "title": w["title"], "year": w["publication_year"],
        "doi": w.get("doi"),
        "venue": ((w.get("primary_location") or {}).get("source") or {}).get("display_name"),
        "authors": [a["author"]["display_name"] for a in w["authorships"]][:8],
        "cited_by_count": w["cited_by_count"], "abstract": abstract(w.get("abstract_inverted_index")),
        "topics": [topic],
    }


def main() -> None:
    path = ROOT / "research" / "literature_corpus.json"
    corpus = {r["openalex_id"]: r for r in json.loads(path.read_text())}
    for t in TITLES:
        res = get({"filter": f"title.search:{t.replace(',', ' ')}", "sort": "cited_by_count:desc", "per-page": 1})
        if res:
            r = to_rec(res[0], "targeted")
            corpus.setdefault(r["openalex_id"], r)
            print("OK ", t[:60], "->", r["title"][:70], r["year"])
        time.sleep(1.5)
    for q in KOLKATA:
        for w in get({"filter": f"title_and_abstract.search:{q}", "sort": "cited_by_count:desc", "per-page": 8}):
            r = to_rec(w, "kolkata_flood")
            if r["openalex_id"] in corpus:
                continue
            corpus[r["openalex_id"]] = r
        time.sleep(1.5)
    path.write_text(json.dumps(list(corpus.values()), indent=1, ensure_ascii=False))
    print(len(corpus))


if __name__ == "__main__":
    main()
