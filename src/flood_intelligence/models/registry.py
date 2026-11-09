"""Minimal experiment registry: one JSON record per experiment under experiments/<group>/."""
from __future__ import annotations

import hashlib
import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from ..config import EXPERIMENTS, ROOT


def _git_rev() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True,
                              timeout=10).stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


def dataset_version(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def log_experiment(group: str, exp_id: str, record: dict) -> Path:
    d = EXPERIMENTS / group
    d.mkdir(parents=True, exist_ok=True)
    rec = {"experiment_id": exp_id, "group": group,
           "date_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "git_commit": _git_rev(), "python": platform.python_version(), **record}
    p = d / f"{exp_id}.json"
    p.write_text(json.dumps(rec, indent=2, default=float))
    return p
