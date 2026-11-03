#!/usr/bin/env python3
"""Pack curated Avatars and Platform defaults into pool/.

For every accepted image: centre-crop to a square (centred on the detected
face when curate.py recorded one), resize to --size, encode WebP at
--quality, name the file by a short content hash, and write pool/index.json
in the shape of PoolIndex from src/pool.ts. Reports total size and projects
it to the --target pool size.

Nothing identifying is written to the index: only category, tags, Platform
and letter for defaults, and for faces the coarse age bucket and presentation
when the curation step had them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

from common import COMPOSITION, CURATED_DIR, DEFAULTS_DIR, POOL_DIR, human_bytes, log, read_jsonl

INDEX_VERSION = 1


def square_crop(image: Image.Image, bbox: list[int] | None) -> Image.Image:
    w, h = image.size
    side = min(w, h)
    cx, cy = w / 2, h / 2
    if bbox:
        x1, y1, x2, y2 = bbox
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    left = int(round(min(max(cx - side / 2, 0), w - side)))
    top = int(round(min(max(cy - side / 2, 0), h - side)))
    return image.crop((left, top, left + side, top + side))


def encode(image: Image.Image, size: int, quality: int) -> bytes:
    import io

    out = image.resize((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def entry_from_record(record: dict[str, Any], category: str) -> dict[str, Any]:
    tags: list[str] = [category]
    entry: dict[str, Any] = {"category": category, "tags": tags}
    if category == "default":
        entry["platform"] = record["platform"]
        tags.extend(record.get("tags", []))
        if record.get("letter"):
            entry["letter"] = record["letter"]
    elif category == "face":
        curation = record.get("curation", {})
        if curation.get("age_bucket"):
            entry["ageBucket"] = curation["age_bucket"]
            tags.append(f"age:{curation['age_bucket']}")
        if curation.get("presentation"):
            entry["presentation"] = curation["presentation"]
            tags.append(curation["presentation"])
    else:
        tags.append("non-face")
    entry["tags"] = sorted(set(tags))
    return entry


def run(args: argparse.Namespace) -> int:
    curated = Path(args.curated)
    defaults = Path(args.defaults)
    out = Path(args.out)
    sources: list[tuple[Path, dict[str, Any]]] = []
    for base in (curated, defaults):
        for record in read_jsonl(base / "manifest.jsonl"):
            sources.append((base / record["file"], record))
    if not sources:
        log(f"nothing to pack in {curated} or {defaults}")
        return 1
    if args.limit:
        sources = sources[: args.limit]

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    bytes_by_category: dict[str, list[int]] = defaultdict(list)
    for path, record in sources:
        category = record["category"]
        image = Image.open(path).convert("RGB")
        bbox = record.get("curation", {}).get("bbox") if category == "face" else None
        data = encode(square_crop(image, bbox), args.size, args.quality)
        digest = hashlib.sha256(data).hexdigest()[:12]
        if digest in seen:
            log(f"skipping exact duplicate {path.name}")
            continue
        seen.add(digest)
        file = f"{digest}.webp"
        (out / file).write_bytes(data)
        entry = {"id": digest, "file": file, **entry_from_record(record, category), "bytes": len(data)}
        entries.append(entry)
        bytes_by_category[category].append(len(data))

    entries.sort(key=lambda e: (e["category"], e["id"]))
    index = {
        "version": INDEX_VERSION,
        "size": args.size,
        "format": "webp",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "entries": entries,
    }
    index_path = out / "index.json"
    index_path.write_text(json.dumps(index, indent=1 if args.pretty else None, separators=(",", ":") if not args.pretty else None) + "\n", encoding="utf-8")

    total = sum(e["bytes"] for e in entries) + index_path.stat().st_size
    log(f"packed {len(entries)} Avatars into {out}: {human_bytes(total)} (index {human_bytes(index_path.stat().st_size)})")
    print(f"{'category':<12}{'count':>7}{'avg':>10}{'max':>10}{'projected@target':>18}")
    projected = 0.0
    for category, sizes in sorted(bytes_by_category.items()):
        avg = sum(sizes) / len(sizes)
        share = COMPOSITION.get(category, 0)
        proj = avg * args.target * share
        projected += proj
        print(f"{category:<12}{len(sizes):>7}{human_bytes(avg):>10}{human_bytes(max(sizes)):>10}{human_bytes(proj):>18}")
    missing = [c for c in COMPOSITION if c not in bytes_by_category]
    print(f"{'total':<12}{len(entries):>7}{'':>10}{'':>10}{human_bytes(projected):>18}")
    if missing:
        print(f"(no sample for {', '.join(missing)}; projection excludes their share)")
    budget = args.budget_mb * 1024 * 1024
    if projected > budget:
        print(f"WARNING: projected {human_bytes(projected)} exceeds the {args.budget_mb} MB budget; lower --quality or --size")
    else:
        print(f"projected {human_bytes(projected)} for {args.target} Avatars is within the {args.budget_mb} MB budget")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--curated", default=str(CURATED_DIR))
    ap.add_argument("--defaults", default=str(DEFAULTS_DIR))
    ap.add_argument("--out", default=str(POOL_DIR))
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--target", type=int, default=3000, help="pool size the size projection is for")
    ap.add_argument("--budget-mb", type=float, default=60.0)
    ap.add_argument("--limit", type=int, default=0, help="pack only the first N sources (size sampling)")
    ap.add_argument("--pretty", action="store_true", help="indent index.json")
    ap.add_argument("--dry-run", action="store_true", help="use the *-dry-run directories")
    args = ap.parse_args(argv)
    if args.dry_run:
        if args.curated == str(CURATED_DIR):
            args.curated = str(CURATED_DIR.parent / "curated-dry-run")
        if args.defaults == str(DEFAULTS_DIR):
            args.defaults = str(DEFAULTS_DIR.parent / "defaults-dry-run")
        if args.out == str(POOL_DIR):
            args.out = str(POOL_DIR.parent / "pool-dry-run")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
