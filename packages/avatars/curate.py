#!/usr/bin/env python3
"""Curate raw Avatar candidates into curated/ and write curation-report.md.

Checks, in order, per image:
  blur            Laplacian variance (on the face crop for faces) under threshold
  faces           face category: exactly one face, large enough, confident,
                  estimated age >= --min-age; other categories: no face at all
  nsfw            open ViT classifier (Falconsai/nsfw_image_detection, Apache-2.0)
  duplicate       cosine similarity to an already accepted image of the same
                  category (face embedding for faces, CLIP for the rest)
  balance-cap     optional cap per (age bucket x presentation) cell for faces

Backends degrade on purpose so the pipeline can be smoke-tested on a CPU with
nothing downloaded:
  --detector insightface   buffalo_l pack (detection, ArcFace embedding, age,
                           gender). NOTE: the pack is licensed for
                           non-commercial research only, see SPIKE.md.
  --detector haar          OpenCV Haar cascade, ships with opencv, weak, no
                           embedding or attributes. Used by --dry-run.
  --embed clip | pixels    CLIP ViT-B/32 (MIT) or a 32x32 grey thumbnail.
  --nsfw auto | off

The run is not resumable: it re-reads raw/ from scratch and overwrites the
output directory. On a GPU this is minutes for 5,000 images.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from common import (
    AGE_BUCKETS,
    COMPOSITION,
    CURATED_DIR,
    GENERATED_CATEGORIES,
    PRESENTATIONS,
    RAW_DIR,
    age_bucket,
    append_jsonl,
    log,
    read_jsonl,
)

# --- Face detection backends ---------------------------------------------


@dataclass
class FaceHit:
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2 in pixels
    score: float
    embedding: np.ndarray | None = None
    age: float | None = None
    presentation: str | None = None  # "masculine" | "feminine"


class HaarDetector:
    name = "haar"
    has_embedding = False
    has_attributes = False

    def __init__(self) -> None:
        import cv2

        path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        self.cascade = cv2.CascadeClassifier(str(path))
        self.cv2 = cv2

    def detect(self, rgb: np.ndarray) -> list[FaceHit]:
        gray = self.cv2.cvtColor(rgb, self.cv2.COLOR_RGB2GRAY)
        found = self.cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        return [FaceHit(bbox=(int(x), int(y), int(x + w), int(y + h)), score=1.0) for (x, y, w, h) in found]


class InsightFaceDetector:
    name = "insightface/buffalo_l"
    has_embedding = True
    has_attributes = True

    def __init__(self, device: str) -> None:
        from insightface.app import FaceAnalysis

        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device == "cuda" else ["CPUExecutionProvider"]
        self.app = FaceAnalysis(name="buffalo_l", providers=providers)
        self.app.prepare(ctx_id=0 if device == "cuda" else -1, det_size=(640, 640))

    def detect(self, rgb: np.ndarray) -> list[FaceHit]:
        bgr = rgb[:, :, ::-1]
        hits = []
        for face in self.app.get(bgr):
            x1, y1, x2, y2 = (int(v) for v in face.bbox)
            emb = getattr(face, "normed_embedding", None)
            sex = getattr(face, "sex", None)  # 'M' / 'F' in insightface >= 0.7
            if sex is None and getattr(face, "gender", None) is not None:
                sex = "M" if int(face.gender) == 1 else "F"
            hits.append(
                FaceHit(
                    bbox=(x1, y1, x2, y2),
                    score=float(face.det_score),
                    embedding=None if emb is None else np.asarray(emb, dtype=np.float32),
                    age=None if getattr(face, "age", None) is None else float(face.age),
                    presentation={"M": "masculine", "F": "feminine"}.get(sex) if sex else None,
                )
            )
        return hits


class NoDetector:
    name = "none"
    has_embedding = False
    has_attributes = False

    def detect(self, rgb: np.ndarray) -> list[FaceHit]:
        return []


# --- Embedding backends (dedupe) -----------------------------------------


class PixelEmbedder:
    name = "pixels-32x32"
    threshold = 0.97

    def embed(self, image: Image.Image) -> np.ndarray:
        small = np.asarray(image.convert("L").resize((32, 32), Image.Resampling.BOX), dtype=np.float32).ravel()
        small -= small.mean()
        norm = np.linalg.norm(small)
        return small / norm if norm > 0 else small


class ClipEmbedder:
    name = "openai/clip-vit-base-patch32"
    threshold = 0.92

    def __init__(self, device: str) -> None:
        import torch
        from transformers import CLIPModel, CLIPProcessor

        self.torch = torch
        self.device = device
        self.model = CLIPModel.from_pretrained(self.name).to(device).eval()
        self.processor = CLIPProcessor.from_pretrained(self.name)

    def embed(self, image: Image.Image) -> np.ndarray:
        inputs = self.processor(images=image, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            feats = self.model.get_image_features(**inputs)[0]
        feats = feats / feats.norm()
        return feats.float().cpu().numpy()


class NsfwClassifier:
    name = "Falconsai/nsfw_image_detection"

    def __init__(self, device: str) -> None:
        from transformers import pipeline

        self.pipe = pipeline("image-classification", model=self.name, device=0 if device == "cuda" else -1)

    def nsfw_score(self, image: Image.Image) -> float:
        for row in self.pipe(image):
            if row["label"].lower() == "nsfw":
                return float(row["score"])
        return 0.0


# --- Checks ---------------------------------------------------------------


def laplacian_variance(rgb: np.ndarray) -> float:
    import cv2

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    if max(h, w) > 512:
        scale = 512 / max(h, w)
        gray = cv2.resize(gray, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


@dataclass
class Decision:
    record: dict[str, Any]
    accepted: bool
    reason: str | None = None
    curation: dict[str, Any] = field(default_factory=dict)
    embedding: np.ndarray | None = None


def analyse(
    record: dict[str, Any],
    raw_dir: Path,
    detector: Any,
    embedder: Any,
    nsfw: NsfwClassifier | None,
    args: argparse.Namespace,
) -> Decision:
    path = raw_dir / record["file"]
    category = record["category"]
    try:
        image = Image.open(path).convert("RGB")
    except Exception as exc:  # unreadable file: reject, do not crash the batch
        return Decision(record, False, f"unreadable ({type(exc).__name__})")
    rgb = np.asarray(image)
    h, w = rgb.shape[:2]
    curation: dict[str, Any] = {}

    faces = detector.detect(rgb) if (category == "face" or args.reject_faces_in_non_face) else []

    if category == "face":
        faces = [f for f in faces if f.score >= args.min_det_score]
        if not faces:
            return Decision(record, False, "no-face")
        if len(faces) > 1:
            return Decision(record, False, "multiple-faces")
        face = faces[0]
        x1, y1, x2, y2 = face.bbox
        rel = (x2 - x1) / w
        if rel < args.min_face_ratio:
            return Decision(record, False, "face-too-small")
        if rel > args.max_face_ratio:
            return Decision(record, False, "face-too-large")
        if face.age is not None and face.age < args.min_age:
            return Decision(record, False, "looks-under-age")
        crop = rgb[max(0, y1) : min(h, y2), max(0, x1) : min(w, x2)]
        blur = laplacian_variance(crop) if crop.size else 0.0
        curation.update(
            bbox=[int(x1), int(y1), int(x2), int(y2)],
            det_score=round(face.score, 3),
            blur=round(blur, 1),
        )
        if face.age is not None:
            curation["age_bucket"] = age_bucket(face.age)
        if face.presentation:
            curation["presentation"] = face.presentation
        embedding = face.embedding if face.embedding is not None else embedder.embed(image)
        curation["embedding_source"] = "face" if face.embedding is not None else embedder.name
    else:
        if faces and args.reject_faces_in_non_face:
            big = [f for f in faces if f.score >= args.min_det_score and (f.bbox[2] - f.bbox[0]) / w >= 0.12]
            if big:
                return Decision(record, False, "unexpected-face")
        blur = laplacian_variance(rgb)
        curation["blur"] = round(blur, 1)
        embedding = embedder.embed(image)
        curation["embedding_source"] = embedder.name

    if blur < args.blur_threshold:
        return Decision(record, False, "blurry", curation)

    if nsfw is not None:
        score = nsfw.nsfw_score(image)
        curation["nsfw"] = round(score, 3)
        if score >= args.nsfw_threshold:
            return Decision(record, False, "nsfw", curation)

    return Decision(record, True, None, curation, np.asarray(embedding, dtype=np.float32))


def dedupe(decisions: list[Decision], face_threshold: float, other_threshold: float) -> dict[str, list[float]]:
    """Mark later near-duplicates rejected; returns nearest-neighbour sims per category."""
    nearest: dict[str, list[float]] = defaultdict(list)
    by_category: dict[str, list[Decision]] = defaultdict(list)
    for d in decisions:
        if d.accepted and d.embedding is not None:
            by_category[d.record["category"]].append(d)
    for category, items in by_category.items():
        threshold = face_threshold if category == "face" else other_threshold
        kept: list[np.ndarray] = []
        for d in items:
            if kept:
                sims = np.stack(kept) @ d.embedding
                best = float(sims.max())
                nearest[category].append(best)
                if best >= threshold:
                    d.accepted = False
                    d.reason = "duplicate"
                    d.curation["duplicate_similarity"] = round(best, 3)
                    continue
            kept.append(d.embedding)
    return nearest


def balance_cap(decisions: list[Decision], max_per_cell: int) -> None:
    cells: Counter[tuple[str, str]] = Counter()
    for d in decisions:
        if not d.accepted or d.record["category"] != "face":
            continue
        cell = (d.curation.get("age_bucket", "unknown"), d.curation.get("presentation", "unknown"))
        cells[cell] += 1
        if cells[cell] > max_per_cell:
            d.accepted = False
            d.reason = "balance-cap"


def percentile_line(values: list[float]) -> str:
    if not values:
        return "n/a"
    arr = np.asarray(values)
    p = np.percentile(arr, [50, 90, 99])
    return f"p50 {p[0]:.3f}, p90 {p[1]:.3f}, p99 {p[2]:.3f}, max {arr.max():.3f}"


def write_report(path: Path, decisions: list[Decision], nearest: dict[str, list[float]], args: argparse.Namespace, backends: dict[str, str]) -> None:
    lines: list[str] = ["# Curation report", ""]
    lines.append(f"Raw: `{args.raw}`  Curated: `{args.out}`")
    lines.append("")
    lines.append("## Settings")
    lines.append("")
    for k, v in backends.items():
        lines.append(f"- {k}: {v}")
    lines.append(
        f"- thresholds: blur < {args.blur_threshold}, face dup >= {args.face_dup}, other dup >= {args.other_dup}, "
        f"nsfw >= {args.nsfw_threshold}, min age {args.min_age}, face width {args.min_face_ratio:.2f}..{args.max_face_ratio:.2f} of image"
    )
    if args.max_per_cell:
        lines.append(f"- balance cap: {args.max_per_cell} faces per (age bucket x presentation) cell")
    lines.append("")

    lines.append("## Per category")
    lines.append("")
    lines.append("| category | raw | accepted | needed for target | shortfall | rejected (reason: count) |")
    lines.append("|---|---:|---:|---:|---:|---|")
    cats = sorted({d.record["category"] for d in decisions}, key=lambda c: GENERATED_CATEGORIES.index(c) if c in GENERATED_CATEGORIES else 99)
    for category in cats:
        ds = [d for d in decisions if d.record["category"] == category]
        accepted = sum(d.accepted for d in ds)
        reasons = Counter(d.reason for d in ds if not d.accepted)
        needed = round(args.target * COMPOSITION.get(category, 0))
        shortfall = max(0, needed - accepted)
        reason_txt = ", ".join(f"{r}: {n}" for r, n in reasons.most_common()) or "-"
        lines.append(f"| {category} | {len(ds)} | {accepted} | {needed} | {shortfall} | {reason_txt} |")
    lines.append("")

    faces = [d for d in decisions if d.accepted and d.record["category"] == "face"]
    lines.append("## Faces: detected spread (age bucket x presentation)")
    lines.append("")
    if faces and any("age_bucket" in d.curation for d in faces):
        lines.append("| age bucket | " + " | ".join(PRESENTATIONS + ["unknown"]) + " | total |")
        lines.append("|---|" + "---:|" * (len(PRESENTATIONS) + 2))
        for bucket in AGE_BUCKETS + ["unknown"]:
            row = [sum(1 for d in faces if d.curation.get("age_bucket", "unknown") == bucket and d.curation.get("presentation", "unknown") == p) for p in PRESENTATIONS + ["unknown"]]
            if sum(row) == 0 and bucket == "unknown":
                continue
            lines.append(f"| {bucket} | " + " | ".join(str(n) for n in row) + f" | {sum(row)} |")
    else:
        lines.append("Not available: the detector in use reports no age/gender (use `--detector insightface`).")
    lines.append("")

    lines.append("## Faces: prompted spread of accepted images (from the raw manifest)")
    lines.append("")
    for key in ("age_bucket", "presentation", "ethnicity"):
        counts = Counter(d.record.get("meta", {}).get(key, "?") for d in faces)
        if counts:
            lines.append(f"- {key}: " + ", ".join(f"{k} {n}" for k, n in sorted(counts.items(), key=lambda kv: -kv[1])))
    if faces and all("age_bucket" in d.curation for d in faces):
        agree = sum(1 for d in faces if d.curation.get("age_bucket") == d.record.get("meta", {}).get("age_bucket"))
        lines.append(f"- prompted vs detected age bucket agreement: {agree}/{len(faces)}")
    lines.append("")

    lines.append("## Dedupe: nearest accepted neighbour similarity")
    lines.append("")
    for category in cats:
        lines.append(f"- {category}: {percentile_line(nearest.get(category, []))}")
    lines.append("")
    lines.append("## Next")
    lines.append("")
    lines.append("- Open `curated/` and `curated/_rejected/` for the visual pass; delete anything off.")
    lines.append("- If a category is short, raise OVERSAMPLE for it in common.py and rerun generate.py (it resumes).")
    lines.append("- Then run `pack.py`.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(args: argparse.Namespace) -> int:
    raw_dir = Path(args.raw)
    out = Path(args.out)
    manifest = raw_dir / "manifest.jsonl"
    records = list(read_jsonl(manifest))
    if not records:
        log(f"no records in {manifest}")
        return 1
    if args.categories:
        records = [r for r in records if r["category"] in args.categories]
    if args.limit:
        per: Counter[str] = Counter()
        kept = []
        for r in records:
            per[r["category"]] += 1
            if per[r["category"]] <= args.limit:
                kept.append(r)
        records = kept

    device = args.device
    if device is None:
        try:
            import torch

            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"

    detector_name = args.detector
    if detector_name == "auto":
        try:
            import insightface  # noqa: F401

            detector_name = "insightface"
        except ImportError:
            detector_name = "haar"
            log("insightface not installed, falling back to the Haar cascade (no embeddings or attributes)")
    detector = {"insightface": lambda: InsightFaceDetector(device), "haar": HaarDetector, "none": NoDetector}[detector_name]()

    embed_name = args.embed
    if embed_name == "auto":
        try:
            import transformers  # noqa: F401

            embed_name = "clip"
        except ImportError:
            embed_name = "pixels"
            log("transformers not installed, falling back to pixel thumbnails for dedupe")
    embedder = ClipEmbedder(device) if embed_name == "clip" else PixelEmbedder()
    other_dup = args.other_dup if args.other_dup is not None else embedder.threshold

    nsfw: NsfwClassifier | None = None
    if args.nsfw == "on" or (args.nsfw == "auto" and embed_name == "clip"):
        nsfw = NsfwClassifier(device)
    elif args.nsfw == "auto":
        log("NSFW check skipped (transformers not available)")

    args.other_dup = other_dup
    backends = {
        "detector": detector.name,
        "embedding": embedder.name,
        "nsfw": nsfw.name if nsfw else "off",
        "device": device,
        "images": str(len(records)),
    }
    log(f"curating {len(records)} images: {backends}")

    decisions: list[Decision] = []
    for i, record in enumerate(records, 1):
        decisions.append(analyse(record, raw_dir, detector, embedder, nsfw, args))
        if i % 100 == 0 or i == len(records):
            acc = sum(d.accepted for d in decisions)
            log(f"{i}/{len(records)} analysed, {acc} accepted so far")

    nearest = dedupe(decisions, args.face_dup, other_dup)
    if args.max_per_cell:
        balance_cap(decisions, args.max_per_cell)

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for d in decisions:
        src = raw_dir / d.record["file"]
        if d.accepted:
            dst = out / d.record["file"]
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            append_jsonl(out / "manifest.jsonl", {**d.record, "curation": d.curation})
        else:
            append_jsonl(out / "rejected.jsonl", {**d.record, "reason": d.reason, "curation": d.curation})
            if args.keep_rejected and src.exists():
                dst = out / "_rejected" / (d.reason or "unknown") / Path(d.record["file"]).name
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dst)

    report = out / "curation-report.md"
    write_report(report, decisions, nearest, args, backends)
    accepted = sum(d.accepted for d in decisions)
    log(f"accepted {accepted}/{len(decisions)}; report at {report}")
    print(json.dumps({"accepted": accepted, "rejected": Counter(d.reason for d in decisions if not d.accepted)}, indent=2, default=str))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default=str(RAW_DIR))
    ap.add_argument("--out", default=str(CURATED_DIR))
    ap.add_argument("--target", type=int, default=3000, help="pool size used to report shortfalls")
    ap.add_argument("--categories", nargs="*", choices=GENERATED_CATEGORIES)
    ap.add_argument("--limit", type=int, default=0, help="only the first N raw images per category")
    ap.add_argument("--detector", choices=["auto", "insightface", "haar", "none"], default="auto")
    ap.add_argument("--embed", choices=["auto", "clip", "pixels"], default="auto")
    ap.add_argument("--nsfw", choices=["auto", "on", "off"], default="auto")
    ap.add_argument("--nsfw-threshold", type=float, default=0.5)
    ap.add_argument("--blur-threshold", type=float, default=40.0, help="Laplacian variance below this is rejected")
    ap.add_argument("--face-dup", type=float, default=0.5, help="face embedding cosine at or above this is a duplicate")
    ap.add_argument("--other-dup", type=float, default=None, help="non-face cosine threshold (default per embedder)")
    ap.add_argument("--min-det-score", type=float, default=0.6)
    ap.add_argument("--min-face-ratio", type=float, default=0.15, help="face width / image width minimum")
    ap.add_argument("--max-face-ratio", type=float, default=0.95)
    ap.add_argument("--min-age", type=float, default=20.0, help="reject faces the estimator puts under this age")
    ap.add_argument("--max-per-cell", type=int, default=0, help="cap faces per (age bucket x presentation) cell")
    ap.add_argument("--no-reject-faces-in-non-face", dest="reject_faces_in_non_face", action="store_false")
    ap.add_argument("--no-keep-rejected", dest="keep_rejected", action="store_false", help="do not copy rejects into _rejected/")
    ap.add_argument("--device", default=None)
    ap.add_argument("--dry-run", action="store_true", help="CPU, Haar detector, pixel dedupe, no NSFW model")
    args = ap.parse_args(argv)
    if args.dry_run:
        args.device = args.device or "cpu"
        args.detector = "haar" if args.detector == "auto" else args.detector
        args.embed = "pixels" if args.embed == "auto" else args.embed
        args.nsfw = "off" if args.nsfw == "auto" else args.nsfw
        if args.raw == str(RAW_DIR):
            args.raw = str(RAW_DIR.parent / "raw-dry-run")
        if args.out == str(CURATED_DIR):
            args.out = str(CURATED_DIR.parent / "curated-dry-run")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
