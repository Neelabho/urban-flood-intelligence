"""Download manifest: one record per acquired artefact (provenance for the Data Observatory)."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from ..config import METADATA, ROOT

MANIFEST = METADATA / "download_manifest.json"


def _sha256(path: Path, limit: int = 200 * 1024 * 1024) -> str | None:
    if not path.is_file() or path.stat().st_size > limit:
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def record(dataset_id: str, city: str, path: Path, source_url: str, **extra) -> None:
    METADATA.mkdir(parents=True, exist_ok=True)
    items = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []
    rel = str(path.relative_to(ROOT)) if path.is_absolute() else str(path)
    items = [i for i in items if not (i["path"] == rel and i["dataset_id"] == dataset_id)]
    items.append(
        {
            "dataset_id": dataset_id,
            "city": city,
            "path": rel,
            "source_url": source_url,
            "downloaded_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "bytes": path.stat().st_size if path.exists() and path.is_file() else None,
            "sha256": _sha256(path),
            **extra,
        }
    )
    MANIFEST.write_text(json.dumps(sorted(items, key=lambda i: (i["dataset_id"], i["path"])), indent=2))
