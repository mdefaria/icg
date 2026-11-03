#!/usr/bin/env python3
"""Download the curation face models into models/ and verify them against models/CHECKSUMS.

YuNet (face detection, MIT) and SFace (face recognition, Apache-2.0) from the
OpenCV Zoo, plus their licence files. models/ is untracked except CHECKSUMS.

A file with no CHECKSUMS entry is hashed after download and the entry is
appended: review that diff and commit it. A file whose hash disagrees with its
entry is deleted and the script exits 1.

The ONNX files are LFS objects, so the raw.githubusercontent.com URL returns a
~130 byte pointer; media.githubusercontent.com serves the content.
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import MODELS_DIR, log, read_checksums, sha256_file  # noqa: E402

REV = "main"
ZOO = "opencv/opencv_zoo"
FILES = {
    "face_detection_yunet_2023mar.onnx": f"https://media.githubusercontent.com/media/{ZOO}/{REV}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": f"https://media.githubusercontent.com/media/{ZOO}/{REV}/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    "LICENSE.yunet": f"https://raw.githubusercontent.com/{ZOO}/{REV}/models/face_detection_yunet/LICENSE",
    "LICENSE.sface": f"https://raw.githubusercontent.com/{ZOO}/{REV}/models/face_recognition_sface/LICENSE",
}


def download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=60) as resp, tmp.open("wb") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)
    tmp.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=str(MODELS_DIR))
    ap.add_argument("--check", action="store_true", help="only verify files already in place; download nothing")
    args = ap.parse_args()
    models = Path(args.dir)
    models.mkdir(parents=True, exist_ok=True)
    expected = read_checksums(models)
    new: dict[str, str] = {}
    failed = False

    for name, url in FILES.items():
        dest = models / name
        if not dest.exists():
            if args.check:
                log(f"missing {name}")
                failed = True
                continue
            log(f"downloading {name}")
            download(url, dest)
        digest = sha256_file(dest)
        if name in expected:
            if digest != expected[name]:
                log(f"CHECKSUM MISMATCH {name}: got {digest}, expected {expected[name]}")
                if dest.stat().st_size < 1024 and dest.read_bytes().startswith(b"version https://"):
                    log("  that is an LFS pointer, not the model: use the media.githubusercontent.com URL")
                dest.unlink()
                failed = True
                continue
            log(f"ok {name}")
        elif args.check:
            log(f"no CHECKSUMS entry for {name}")
            failed = True
        else:
            new[name] = digest
            log(f"first fetch of {name}: sha256 {digest} (recording in CHECKSUMS)")

    if new:
        path = models / "CHECKSUMS"
        header = "" if path.exists() else "# sha256  file. Written by scripts/fetch-models.py on first fetch; commit this file.\n"
        with path.open("a", encoding="utf-8") as f:
            f.write(header + "".join(f"{d}  {n}\n" for n, d in new.items()))
        log("CHECKSUMS updated: review and commit it")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
