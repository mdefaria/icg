"""Shared helpers for the Avatar pool pipeline (generate -> curate -> pack).

Vocabulary follows CONTEXT.md: an Avatar is a synthetic profile picture, the
pool is the packed set bundled in every Host. Nothing here runs at runtime.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "raw"
CURATED_DIR = ROOT / "curated"
DEFAULTS_DIR = ROOT / "defaults"
POOL_DIR = ROOT / "pool"

# Share of the finished pool per category. Mirrors POOL_COMPOSITION in src/pool.ts.
# 60% faces, 25% non-face, 15% Platform defaults (procedural, see defaults.py).
COMPOSITION: dict[str, float] = {
    "face": 0.60,
    "pet": 0.05,
    "car": 0.03,
    "anime": 0.04,
    "landscape": 0.035,
    "selfie-back": 0.03,
    "food": 0.03,
    "gym": 0.035,
    "default": 0.15,
}
assert abs(sum(COMPOSITION.values()) - 1.0) < 1e-9

GENERATED_CATEGORIES = [c for c in COMPOSITION if c != "default"]
NON_FACE_CATEGORIES = [c for c in GENERATED_CATEGORIES if c != "face"]

# Curation rejects a share of what the model produces; generate this much extra.
OVERSAMPLE: dict[str, float] = {"face": 2.0}
DEFAULT_OVERSAMPLE = 1.5

AGE_BUCKETS = ["young-adult", "adult", "middle-aged", "senior"]
PRESENTATIONS = ["masculine", "feminine"]


def age_bucket(age: float) -> str:
    if age < 30:
        return "young-adult"
    if age < 45:
        return "adult"
    if age < 60:
        return "middle-aged"
    return "senior"


def plan_counts(target: int) -> dict[str, int]:
    """How many raw images to generate per category for a pool of `target`."""
    counts: dict[str, int] = {}
    for category in GENERATED_CATEGORIES:
        wanted = round(target * COMPOSITION[category])
        counts[category] = int(round(wanted * OVERSAMPLE.get(category, DEFAULT_OVERSAMPLE)))
    return counts


def seed_for(category: str, index: int) -> int:
    """Deterministic 32-bit seed for the index-th image of a category."""
    digest = hashlib.sha256(f"icg-avatars:{category}:{index}".encode()).digest()
    return int.from_bytes(digest[:4], "big")


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    if not path.exists():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def human_bytes(n: float) -> str:
    if n < 1024:
        return f"{int(n)} B"
    for unit in ("KB", "MB", "GB"):
        n /= 1024
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}"
    return f"{n:.1f} GB"
