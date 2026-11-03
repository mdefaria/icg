#!/usr/bin/env python3
"""Generate raw Avatar candidates with diffusers.

Writes raw/<category>/<seed>.png and raw/manifest.jsonl (prompt, seed,
category, model, meta). Deterministic: the i-th image of a category always
gets the same seed and prompt, so the run is resumable and reproducible.

Models (all permissive for commercial use, see SPIKE.md):
  z-image-turbo  Tongyi-MAI/Z-Image-Turbo, Apache-2.0, 6B, 8 steps. Default.
  flux-schnell   black-forest-labs/FLUX.1-schnell, Apache-2.0, 12B, 4 steps.
  sdxl           SG161222/RealVisXL_V5.0, OpenRAIL++, 25 steps, needs negatives.
  tiny-test      hf-internal-testing/tiny-stable-diffusion-pipe, CPU smoke test only.

Examples:
  python generate.py --plan                       # show per-category counts
  python generate.py --dry-run                    # 2 images on CPU with tiny-test
  python generate.py --target 200                 # the 200-image spike sample
  python generate.py --target 3000 --model flux-schnell --quantize nf4
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from common import (
    GENERATED_CATEGORIES,
    RAW_DIR,
    append_jsonl,
    log,
    plan_counts,
    read_jsonl,
    seed_for,
)
from prompts import build_prompt

MODELS: dict[str, dict[str, Any]] = {
    "z-image-turbo": {
        "repo": "Tongyi-MAI/Z-Image-Turbo",
        "pipeline": "ZImagePipeline",
        "steps": 9,  # 9 scheduler steps = 8 DiT forwards, per the model card
        "guidance": 0.0,
        "uses_negative": False,
        "dtype": "bfloat16",
        "licence": "Apache-2.0",
    },
    "flux-schnell": {
        "repo": "black-forest-labs/FLUX.1-schnell",
        "pipeline": "FluxPipeline",
        "steps": 4,
        "guidance": 0.0,
        "uses_negative": False,
        "dtype": "bfloat16",
        "licence": "Apache-2.0",
        "extra_call_kwargs": {"max_sequence_length": 256},
    },
    "sdxl": {
        "repo": "SG161222/RealVisXL_V5.0",
        "pipeline": "StableDiffusionXLPipeline",
        "steps": 25,
        "guidance": 5.0,
        "uses_negative": True,
        "dtype": "float16",
        "licence": "CreativeML OpenRAIL++-M",
        "min_size": 768,  # SDXL falls apart below ~768 px; pack.py downsizes anyway
    },
    "tiny-test": {
        "repo": "hf-internal-testing/tiny-stable-diffusion-pipe",
        "pipeline": "StableDiffusionPipeline",
        "steps": 2,
        "guidance": 1.0,
        "uses_negative": True,
        "dtype": "float32",
        "licence": "test fixture, never ship its output",
        "size": 64,
    },
}


class Generator:
    """Thin wrapper over a diffusers pipeline; imports torch lazily."""

    def __init__(self, model: str, device: str, quantize: str | None, offload: bool) -> None:
        import torch
        import diffusers

        self.spec = MODELS[model]
        self.model = model
        self.device = device
        dtype = getattr(torch, self.spec["dtype"])
        if device == "cpu" and dtype is torch.float16:
            dtype = torch.float32
        pipeline_cls = getattr(diffusers, self.spec["pipeline"])
        repo = self.spec["repo"]
        load_kwargs: dict[str, Any] = {"torch_dtype": dtype}

        if quantize == "nf4" and model == "flux-schnell":
            # Fits FLUX.1-schnell on 12 GB cards. Needs `bitsandbytes`.
            from diffusers import BitsAndBytesConfig as DiffusersBnb
            from diffusers import FluxTransformer2DModel
            from transformers import BitsAndBytesConfig as TransformersBnb
            from transformers import T5EncoderModel

            transformer = FluxTransformer2DModel.from_pretrained(
                repo,
                subfolder="transformer",
                quantization_config=DiffusersBnb(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype),
                torch_dtype=dtype,
            )
            text_encoder_2 = T5EncoderModel.from_pretrained(
                repo,
                subfolder="text_encoder_2",
                quantization_config=TransformersBnb(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype),
                torch_dtype=dtype,
            )
            load_kwargs.update(transformer=transformer, text_encoder_2=text_encoder_2)
        elif quantize:
            log(f"--quantize {quantize} is only wired for flux-schnell; loading {model} unquantized")

        log(f"loading {repo} ({self.spec['pipeline']}, {dtype}) on {device}")
        self.pipe = pipeline_cls.from_pretrained(repo, **load_kwargs)
        if offload and device != "cpu":
            self.pipe.enable_model_cpu_offload()
        else:
            self.pipe.to(device)
        if hasattr(self.pipe, "set_progress_bar_config"):
            self.pipe.set_progress_bar_config(disable=True)
        self.torch = torch

    def generate(self, prompt: str, negative: str, seed: int, size: int, steps: int | None):
        spec = self.spec
        size = max(size, spec.get("min_size", 0))
        size = spec.get("size", size)
        gen = self.torch.Generator(device="cpu").manual_seed(seed)
        kwargs: dict[str, Any] = {
            "prompt": prompt,
            "height": size,
            "width": size,
            "num_inference_steps": steps or spec["steps"],
            "guidance_scale": spec["guidance"],
            "generator": gen,
        }
        if spec["uses_negative"]:
            kwargs["negative_prompt"] = negative
        kwargs.update(spec.get("extra_call_kwargs", {}))
        return self.pipe(**kwargs).images[0]


def existing_seeds(manifest: Path) -> set[tuple[str, int]]:
    return {(r["category"], int(r["seed"])) for r in read_jsonl(manifest)}


def run(args: argparse.Namespace) -> int:
    out = Path(args.out)
    manifest = out / "manifest.jsonl"
    counts = plan_counts(args.target)
    if args.categories:
        counts = {c: n for c, n in counts.items() if c in args.categories}
    if args.dry_run:
        # Two images: one face, one non-face, enough to smoke-test the plumbing.
        counts = {"face": 1, "pet": 1}
        if args.categories:
            counts = {c: 1 for c in args.categories}

    if args.plan:
        total = sum(counts.values())
        print(json.dumps({"target_pool": args.target, "raw_per_category": counts, "raw_total": total}, indent=2))
        return 0

    done = existing_seeds(manifest)
    todo: list[tuple[str, int, int]] = []
    for category, n in counts.items():
        for i in range(n):
            seed = seed_for(category, i)
            png = out / category / f"{seed}.png"
            if (category, seed) in done and png.exists():
                continue
            todo.append((category, i, seed))
    log(f"{len(done)} already generated, {len(todo)} to go ({sum(counts.values())} planned)")
    if not todo:
        return 0

    generator = Generator(args.model, args.device, args.quantize, args.offload)
    started = time.perf_counter()
    for n, (category, index, seed) in enumerate(todo, 1):
        p = build_prompt(category, seed)
        png = out / category / f"{seed}.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        t0 = time.perf_counter()
        image = generator.generate(p.prompt, p.negative, seed, args.size, args.steps)
        image.save(png)
        record = {
            "category": category,
            "index": index,
            "seed": seed,
            "file": str(png.relative_to(out)),
            "model": args.model,
            "repo": MODELS[args.model]["repo"],
            "size": image.width,
            "steps": args.steps or MODELS[args.model]["steps"],
            **asdict(p),
        }
        append_jsonl(manifest, record)
        if n % 10 == 0 or n == len(todo) or args.dry_run:
            per = (time.perf_counter() - started) / n
            eta = per * (len(todo) - n)
            log(f"{n}/{len(todo)} {category} seed={seed} {time.perf_counter() - t0:.1f}s (avg {per:.1f}s, eta {eta / 60:.0f} min)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", type=int, default=3000, help="pool size the raw counts are planned for")
    ap.add_argument("--model", choices=sorted(MODELS), default="z-image-turbo")
    ap.add_argument("--size", type=int, default=512, help="square output size in px (model minimums apply)")
    ap.add_argument("--steps", type=int, default=None, help="override the model's default step count")
    ap.add_argument("--out", default=str(RAW_DIR))
    ap.add_argument("--categories", nargs="*", choices=GENERATED_CATEGORIES, help="restrict to these categories")
    ap.add_argument("--device", default=None, help="cuda (default when available) or cpu")
    ap.add_argument("--quantize", choices=["nf4"], default=None, help="nf4 via bitsandbytes (flux-schnell only)")
    ap.add_argument("--offload", action="store_true", help="enable_model_cpu_offload() for 12 GB cards")
    ap.add_argument("--plan", action="store_true", help="print the per-category counts and exit")
    ap.add_argument("--dry-run", action="store_true", help="2 images on CPU with the tiny-test model")
    args = ap.parse_args(argv)

    if args.dry_run:
        args.device = args.device or "cpu"
        if args.model == "z-image-turbo" and "--model" not in (argv or sys.argv):
            args.model = "tiny-test"
        args.out = args.out if args.out != str(RAW_DIR) else str(RAW_DIR.parent / "raw-dry-run")
    if args.device is None:
        try:
            import torch

            args.device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            args.device = "cpu"
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
