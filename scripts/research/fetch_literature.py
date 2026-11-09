"""Retrieve candidate literature from OpenAlex (title, authors, venue, year, DOI, abstract).

Only records returned by the OpenAlex API are stored; the literature review cites nothing that is not
in research/literature_corpus.json, and every DOI there resolves via doi.org.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
UA = {"User-Agent": "UFII-research/0.1 (academic project)"}
QUERIES = {
    "urban_flood_susceptibility_ml": ('"flood susceptibility" AND "machine learning" AND urban', 6),
    "flood_ml_review": ('"flood prediction" AND "machine learning" AND review', 3),
    "kolkata_flood": ('Kolkata AND (flood OR waterlogging)', 8),
    "mumbai_flood": ('Mumbai AND flood AND (rainfall OR urban)', 5),
    "sar_flood_mapping": ('"Sentinel-1" AND flood AND mapping', 4),
    "sar_urban_flood": ('SAR AND "urban flood" AND (detection OR mapping)', 4),
    "spatial_cv": ('"spatial cross-validation" OR "spatial autocorrelation" AND "cross-validation" AND model', 4),
    "lstm_rainfall_runoff": ('LSTM AND "rainfall-runoff"', 3),
    "shap_flood": ('SHAP AND flood', 4),
    "global_flood_database": ('"satellite imaging" AND flood AND "population exposure"', 2),
    "hand": ('"height above the nearest drainage"', 3),
    "imd_gridded_rainfall": ('"gridded" AND rainfall AND India AND "0.25"', 3),
    "imerg_india": ('IMERG AND India AND (evaluation OR validation)', 3),
    "transferability": ('flood AND susceptibility AND (transferability OR "transfer learning")', 3),
    "uncertainty_flood_ml": ('flood AND "machine learning" AND uncertainty AND (ensemble OR bootstrap)', 3),
    "convlstm_flood": ('(ConvLSTM OR "graph neural network") AND flood AND forecasting', 3),
}


def search(q: str, n: int) -> list[dict]:
    for attempt in range(10):
        r = requests.get("https://api.openalex.org/works", params={
            "filter": f"title_and_abstract.search:{q},type:article|review", "sort": "cited_by_count:desc",
            "per-page": n}, headers=UA, timeout=60)
        if r.status_code == 429:
            time.sleep(12 + 3 * attempt)
            continue
        r.raise_for_status()
        return r.json()["results"]
    raise RuntimeError("rate limited")


def abstract(inv: dict | None) -> str:
    if not inv:
        return ""
    pos = sorted((p, w) for w, ps in inv.items() for p in ps)
    return " ".join(w for _, w in pos)


def main() -> None:
    corpus = {}
    for topic, (q, n) in QUERIES.items():
        for w in search(q, n):
            key = w["id"].rsplit("/", 1)[-1]
            rec = corpus.setdefault(key, {
                "openalex_id": key,
                "title": w["title"],
                "year": w["publication_year"],
                "doi": w.get("doi"),
                "venue": ((w.get("primary_location") or {}).get("source") or {}).get("display_name"),
                "authors": [a["author"]["display_name"] for a in w["authorships"]][:8],
                "cited_by_count": w["cited_by_count"],
                "abstract": abstract(w.get("abstract_inverted_index")),
                "topics": [],
            })
            rec["topics"].append(topic)
        time.sleep(2)
        print(topic, "ok", flush=True)
    out = ROOT / "research" / "literature_corpus.json"
    out.write_text(json.dumps(list(corpus.values()), indent=1, ensure_ascii=False))
    print(len(corpus), "works")


if __name__ == "__main__":
    main()
