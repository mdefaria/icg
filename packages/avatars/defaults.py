#!/usr/bin/env python3
"""Render the Platform default Avatars procedurally (no model involved).

Two kinds:
  silhouette  the grey "no profile picture" person icon, one palette per
              Platform (TikTok, Instagram, YouTube, X) and theme, in a few
              tonal variants
  letter      coloured disc with a white initial (YouTube / Google style)

Every image is also written as SVG next to the PNG so S5 (renderer fidelity)
can reuse the geometry; the PNG is rendered by Pillow with 4x supersampling
so no cairo install is needed on the owner's machine.

Output: defaults/<name>.png, defaults/<name>.svg, defaults/manifest.jsonl.
"""

from __future__ import annotations

import argparse
import string
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from common import DEFAULTS_DIR, append_jsonl, log

PLATFORMS = ["tiktok", "instagram", "youtube", "x"]

# Approximations of each Platform's default avatar colours, to be checked
# against real screenshots in S5. (bg, fg) per theme.
SILHOUETTE_PALETTES: dict[str, dict[str, list[tuple[str, str]]]] = {
    "tiktok": {
        "light": [("#E6E6E6", "#B5B5B5"), ("#DADADA", "#A6A6A6"), ("#EDEDED", "#C2C2C2")],
        "dark": [("#3A3A3A", "#8C8C8C"), ("#2F2F2F", "#7D7D7D"), ("#444444", "#999999")],
    },
    "instagram": {
        "light": [("#DBDBDB", "#FFFFFF"), ("#D0D0D0", "#FAFAFA"), ("#E3E3E3", "#FFFFFF")],
        "dark": [("#363636", "#A8A8A8"), ("#2C2C2C", "#9A9A9A"), ("#404040", "#B3B3B3")],
    },
    "youtube": {
        "light": [("#E0E0E0", "#9E9E9E"), ("#D6D6D6", "#8F8F8F")],
        "dark": [("#3D3D3D", "#8A8A8A"), ("#333333", "#7A7A7A")],
    },
    "x": {
        "light": [("#CFD9DE", "#FFFFFF"), ("#C4CFD4", "#FFFFFF"), ("#D6DFE4", "#FFFFFF")],
        "dark": [("#333639", "#8B98A5"), ("#2F3336", "#7F8C99"), ("#3A3E42", "#96A3B0")],
    },
}

# Material-ish palette used by Google/YouTube letter avatars.
LETTER_COLOURS = [
    "#F44336", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3", "#0097A7",
    "#00897B", "#43A047", "#7CB342", "#F4511E", "#6D4C41", "#546E7A", "#C0CA33",
    "#FB8C00", "#8E24AA",
]


@dataclass
class Silhouette:
    head_r: float  # head radius as a fraction of the canvas
    head_cy: float
    shoulder_w: float  # half width of the shoulders ellipse
    shoulder_cy: float  # centre y of the shoulders ellipse (below the canvas bottom when > 1)
    shoulder_h: float


# Per-Platform silhouette proportions (fractions of the canvas side).
SHAPES: dict[str, Silhouette] = {
    "tiktok": Silhouette(head_r=0.17, head_cy=0.40, shoulder_w=0.34, shoulder_cy=0.98, shoulder_h=0.30),
    "instagram": Silhouette(head_r=0.16, head_cy=0.40, shoulder_w=0.36, shoulder_cy=1.00, shoulder_h=0.32),
    "youtube": Silhouette(head_r=0.15, head_cy=0.38, shoulder_w=0.32, shoulder_cy=0.96, shoulder_h=0.30),
    "x": Silhouette(head_r=0.18, head_cy=0.42, shoulder_w=0.37, shoulder_cy=1.02, shoulder_h=0.34),
}


def silhouette_svg(size: int, bg: str, fg: str, shape: Silhouette) -> str:
    s = size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">'
        f'<rect width="{s}" height="{s}" fill="{bg}"/>'
        f'<clipPath id="c"><rect width="{s}" height="{s}"/></clipPath>'
        f'<g clip-path="url(#c)" fill="{fg}">'
        f'<circle cx="{s / 2:.1f}" cy="{shape.head_cy * s:.1f}" r="{shape.head_r * s:.1f}"/>'
        f'<ellipse cx="{s / 2:.1f}" cy="{shape.shoulder_cy * s:.1f}" rx="{shape.shoulder_w * s:.1f}" ry="{shape.shoulder_h * s:.1f}"/>'
        "</g></svg>"
    )


def render_silhouette(size: int, bg: str, fg: str, shape: Silhouette, ss: int = 4) -> Image.Image:
    s = size * ss
    img = Image.new("RGB", (s, s), bg)
    d = ImageDraw.Draw(img)
    cx = s / 2
    r = shape.head_r * s
    cy = shape.head_cy * s
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fg)
    rx, ry, scy = shape.shoulder_w * s, shape.shoulder_h * s, shape.shoulder_cy * s
    d.ellipse((cx - rx, scy - ry, cx + rx, scy + ry), fill=fg)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def letter_svg(size: int, bg: str, letter: str) -> str:
    s = size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">'
        f'<rect width="{s}" height="{s}" fill="{bg}"/>'
        f'<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="Roboto, Inter, Arial, sans-serif" '
        f'font-size="{s * 0.52:.0f}" fill="#FFFFFF">{letter}</text></svg>'
    )


def load_font(font_path: str | None, px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if font_path:
        return ImageFont.truetype(font_path, px)
    try:
        return ImageFont.load_default(size=px)  # Pillow >= 10.1 bundles a scalable font
    except TypeError:
        return ImageFont.load_default()


def render_letter(size: int, bg: str, letter: str, font_path: str | None, ss: int = 4) -> Image.Image:
    s = size * ss
    img = Image.new("RGB", (s, s), bg)
    d = ImageDraw.Draw(img)
    font = load_font(font_path, int(s * 0.52))
    left, top, right, bottom = d.textbbox((0, 0), letter, font=font)
    x = (s - (right - left)) / 2 - left
    y = (s - (bottom - top)) / 2 - top
    d.text((x, y), letter, font=font, fill="#FFFFFF")
    return img.resize((size, size), Image.Resampling.LANCZOS)


def run(args: argparse.Namespace) -> int:
    out = Path(args.out)
    if out.exists():
        for p in out.iterdir():
            p.unlink()
    out.mkdir(parents=True, exist_ok=True)
    manifest = out / "manifest.jsonl"
    count = 0

    for platform in PLATFORMS:
        shape = SHAPES[platform]
        for theme, palette in SILHOUETTE_PALETTES[platform].items():
            for i, (bg, fg) in enumerate(palette):
                name = f"{platform}-silhouette-{theme}-{i}"
                render_silhouette(args.size, bg, fg, shape).save(out / f"{name}.png")
                if args.svg:
                    (out / f"{name}.svg").write_text(silhouette_svg(args.size, bg, fg, shape), encoding="utf-8")
                append_jsonl(manifest, {"category": "default", "platform": platform, "file": f"{name}.png", "tags": ["silhouette", theme]})
                count += 1

    letters = string.ascii_uppercase if not args.dry_run else "AB"
    colours = LETTER_COLOURS[: args.colours]
    for letter in letters:
        for i, bg in enumerate(colours):
            name = f"letter-{letter}-{i}"
            render_letter(args.size, bg, letter, args.font).save(out / f"{name}.png")
            if args.svg:
                (out / f"{name}.svg").write_text(letter_svg(args.size, bg, letter), encoding="utf-8")
            # Letter avatars are the YouTube default; X and the others show silhouettes.
            append_jsonl(manifest, {"category": "default", "platform": "youtube", "letter": letter, "file": f"{name}.png", "tags": ["letter"]})
            count += 1

    log(f"rendered {count} default Avatars into {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(DEFAULTS_DIR))
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--colours", type=int, default=10, help="letter colours per letter (26 x N letter avatars)")
    ap.add_argument("--font", default=None, help="TTF for letters (e.g. Roboto-Medium.ttf); default is Pillow's bundled font")
    ap.add_argument("--no-svg", dest="svg", action="store_false")
    ap.add_argument("--dry-run", action="store_true", help="two letters only, into defaults-dry-run/")
    args = ap.parse_args(argv)
    if args.dry_run and args.out == str(DEFAULTS_DIR):
        args.out = str(DEFAULTS_DIR.parent / "defaults-dry-run")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
