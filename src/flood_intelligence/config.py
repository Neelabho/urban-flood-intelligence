"""Paths, city registry and analysis-grid definition shared by every pipeline stage."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import yaml
from affine import Affine
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
INTERIM = DATA / "interim"
PROCESSED = DATA / "processed"
METADATA = DATA / "metadata"
MODELS = ROOT / "models"
EXPERIMENTS = ROOT / "experiments"
REPORTS = ROOT / "reports"
FRONTEND_DATA = ROOT / "frontend" / "public" / "data"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("azure").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


@lru_cache
def registry() -> dict:
    return yaml.safe_load((ROOT / "config" / "cities.yaml").read_text())


@dataclass(frozen=True)
class City:
    id: str
    name: str
    state: str
    status: str
    centre: tuple[float, float]
    bbox: tuple[float, float, float, float]
    utm_epsg: int

    @property
    def crs(self) -> str:
        return f"EPSG:{self.utm_epsg}"

    def raw(self, *parts: str) -> Path:
        p = RAW.joinpath(*parts, self.id)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def interim(self) -> Path:
        p = INTERIM / self.id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def processed(self) -> Path:
        p = PROCESSED / self.id
        p.mkdir(parents=True, exist_ok=True)
        return p


def get_city(city_id: str) -> City:
    c = registry()["cities"][city_id]
    return City(
        id=city_id,
        name=c["name"],
        state=c["state"],
        status=c["status"],
        centre=tuple(c["centre"]),
        bbox=tuple(c["bbox"]),
        utm_epsg=int(c["utm_epsg"]),
    )


@dataclass(frozen=True)
class Grid:
    """Regular analysis grid in the city's UTM zone (metres). Cell (r, c) centre = transform * (c+.5, r+.5)."""

    crs: str
    transform: Affine
    width: int
    height: int
    res: float

    @property
    def shape(self) -> tuple[int, int]:
        return (self.height, self.width)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        x0, y1 = self.transform.c, self.transform.f
        return (x0, y1 - self.height * self.res, x0 + self.width * self.res, y1)

    def cell_centres(self) -> tuple[np.ndarray, np.ndarray]:
        cols, rows = np.meshgrid(np.arange(self.width), np.arange(self.height))
        xs = self.transform.c + (cols + 0.5) * self.res
        ys = self.transform.f - (rows + 0.5) * self.res
        return xs, ys

    def cell_centres_lonlat(self) -> tuple[np.ndarray, np.ndarray]:
        xs, ys = self.cell_centres()
        t = Transformer.from_crs(self.crs, "EPSG:4326", always_xy=True)
        return t.transform(xs, ys)

    def fine(self, factor: int) -> Grid:
        """Sub-grid with the same footprint and `factor`x finer cells (for aggregation)."""
        r = self.res / factor
        return Grid(self.crs, Affine(r, 0, self.transform.c, 0, -r, self.transform.f), self.width * factor,
                    self.height * factor, r)

    def to_json(self) -> dict:
        return {"crs": self.crs, "transform": list(self.transform)[:6], "width": self.width,
                "height": self.height, "res": self.res}


def make_grid(city: City, res: float | None = None) -> Grid:
    res = float(res or registry()["grid_resolution_m"])
    t = Transformer.from_crs("EPSG:4326", city.crs, always_xy=True)
    lon0, lat0, lon1, lat1 = city.bbox
    xs, ys = t.transform([lon0, lon1, lon0, lon1], [lat0, lat0, lat1, lat1])
    x0 = np.floor(min(xs) / res) * res
    y1 = np.ceil(max(ys) / res) * res
    x1 = np.ceil(max(xs) / res) * res
    y0 = np.floor(min(ys) / res) * res
    w, h = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    return Grid(city.crs, Affine(res, 0, x0, 0, -res, y1), w, h, res)


def save_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str))
