# S6 spike: Avatar pool pipeline

## Goal

Everything the owner needs to produce ~3,000 synthetic Avatars on a local NVIDIA GPU (12 to 24 GB), curate them automatically, and pack them into the pool that every Host bundles (ADR 0001: Avatars are generated once at build time, never at runtime). Composition: 60% faces across age, gender presentation and ethnicity, 25% non-face (pets, cars, anime-style characters, landscapes, selfies from behind, food, gym shots), 15% Platform defaults rendered procedurally.

## What was built

All in `packages/avatars/`.

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `common.py`                                   | Composition table (mirrors `POOL_COMPOSITION` in `src/pool.ts`), oversampling factors, deterministic seeds (`sha256("icg-avatars:<category>:<i>")`), age buckets, manifest helpers.                                                                                                                                                                                                                                                                                                        |
| `prompts.py`                                  | Prompt matrix. Faces: age phrase x presentation x 16 broad ethnicity descriptors x 20 settings x 10 lightings x 9 framings x 10 expressions x 20 extras x 6 camera styles, all phone-camera and candid, adults only. Non-face: subject lists per category. `python prompts.py face` prints samples.                                                                                                                                                                                        |
| `generate.py`                                 | diffusers runner with model presets (`z-image-turbo` default, `flux-schnell`, `sdxl`, `tiny-test`), NF4 path for FLUX on 12 GB, CPU offload flag, resumable, writes `raw/<category>/<seed>.png` and `raw/manifest.jsonl` (prompt, seed, category, model, prompt axes as `meta`). `--plan` prints counts, `--dry-run` makes 2 images on CPU.                                                                                                                                                |
| `curate.py`                                   | Blur (Laplacian variance), face count and size (YuNet), apparent-minor screen and coarse age bucket / presentation (CLIP zero-shot, approximate), NSFW classifier, embedding dedupe (SFace for faces, CLIP for the rest), optional per-cell balance cap, `curated/` + `curated/_rejected/<reason>/` for the visual pass, `curation-report.md`. Backends degrade: `yunet` -> `haar`, `clip` -> `pixels`, NSFW on/off. Without `clip` there are no age labels and no automatic minor screen. |
| `pack.py`                                     | Square crop centred on the detected face, 256 px, WebP q80, file name = 12-hex content hash, `pool/index.json` in the `PoolIndex` shape, per-category size table and projection against the 60 MB budget.                                                                                                                                                                                                                                                                                  |
| `defaults.py`                                 | Procedural Platform defaults: silhouettes for TikTok, Instagram, YouTube, X in light/dark tonal variants and letter avatars (26 letters x 10 colours, YouTube/Google style). Pillow render with 4x supersampling plus SVG sources for S5.                                                                                                                                                                                                                                                  |
| `src/pool.ts`                                 | zod: `PoolCategory`, `AgeBucket`, `Presentation`, `PoolEntry` (id, file, category, tags, optional platform/letter/ageBucket/presentation, bytes), `PoolIndex`, `POOL_COMPOSITION`. Nothing identifying.                                                                                                                                                                                                                                                                                    |
| `src/index.ts`                                | `loadPool(indexJson)`, `createRng(seed)` (mulberry32), `pickAvatar(pool, rng, filter)`, `pickAvatars`, `pickCategory` (60/25/15 draw), `pickAvatarForPlatform`. `platform` filter keeps that Platform's defaults plus every Platform-free entry.                                                                                                                                                                                                                                           |
| `src/index.test.ts`, `src/pool.fixture.ts`    | 10 vitest tests on an 8-entry fixture: parsing, determinism, filters, exclusion, distinctness, composition.                                                                                                                                                                                                                                                                                                                                                                                |
| `scripts/fetch-models.py`, `models/CHECKSUMS` | Downloads the YuNet and SFace ONNX files and their licences into `models/` (untracked), verifies SHA-256 against the committed `CHECKSUMS`.                                                                                                                                                                                                                                                                                                                                                |
| `pyproject.toml`, `requirements.txt`          | Base deps (Pillow, numpy, OpenCV >= 4.9, < 5) plus extras `generate`, `curate`, `nf4`, `mediapipe`.                                                                                                                                                                                                                                                                                                                                                                                        |

The `Avatar` contract in `@icg/shared` already has `{ kind: "pool", id }`; `PoolEntry.id` is that id. `@icg/shared` is a dependency only for the `Platform` enum.

## How to run

### GPU setup (Linux or Windows, NVIDIA 12 to 24 GB)

```bash
cd packages/avatars
python3.12 -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cu124   # pick your CUDA at pytorch.org
pip install -e ".[generate,curate]"                   # add ,nf4 for FLUX on 12 GB
```

Then `python scripts/fetch-models.py` (YuNet and SFace, ~39 MB, from the OpenCV Zoo on GitHub; re-run with `--check` to verify). Use Python 3.11 or 3.12 (`mediapipe` has no 3.13 wheels; the curation path itself is pure OpenCV and has no compiled extras). CLIP and the NSFW classifier download from Hugging Face on first use; nothing used here is gated.

### Pipeline

```bash
python generate.py --plan                 # 4,726 raw images for a 3,000 pool (faces x2, others x1.5)
python generate.py --dry-run              # 2 images, CPU, tiny test model: proves the plumbing
python generate.py --target 200           # the S6 sample; look at raw/face before going further
python curate.py --target 200             # read curated/curation-report.md, tune thresholds
python defaults.py                        # 260 letter + 22 silhouette defaults
python pack.py --target 3000              # size table + projection
python generate.py --target 3000          # resumes, only generates what is missing
python curate.py && python pack.py
```

12 GB cards: `generate.py --offload` (Z-Image-Turbo) or `--model flux-schnell --quantize nf4`. Dry-run variants of every script (`--dry-run`) read and write `*-dry-run/` directories so they never touch a real run.

### Expected wall time for the full run (4,726 raw images at 512 px, unverified, from published numbers)

| Card           | Z-Image-Turbo (9 steps)                     | FLUX.1-schnell (4 steps)     |
| -------------- | ------------------------------------------- | ---------------------------- |
| RTX 4090 24 GB | ~1 to 1.5 s/img, about 1.5 to 2 h           | ~1 s/img, about 1.5 h        |
| RTX 4070 12 GB | needs `--offload`, ~4 to 8 s/img, 5 to 10 h | NF4, ~3 to 5 s/img, 4 to 7 h |

Published figures: Z-Image-Turbo ~2.3 s per 1024 px image on a 4090 and 3 to 4 s on a 4070 class card, peak 16 GB in bf16; 512 px is roughly a quarter of the tokens. Curation on a GPU is minutes; on CPU budget ~0.5 s/image. Packing is seconds.

### What ran here

- `pnpm install` and `pnpm check` at the repo root: pass (lint, typecheck, 10 tests in `@icg/avatars`).
- F2 (YuNet + SFace): `fetch-models.py` downloaded both ONNX files and licences from GitHub (the ONNX files are LFS objects, `raw.githubusercontent.com` returns a pointer; `media.githubusercontent.com` serves them). `curate.py --dry-run` on NASA's public-domain astronaut portrait (`skimage.data`), a 480 px resize of it, a drawn face-like image, two identical landscapes and a noise texture, with OpenCV 4.14: YuNet found the portrait (score 0.93), SFace flagged the resize as a duplicate (cosine 0.933 vs the 0.363 threshold), the drawn face was `no-face` (as expected for a cartoon), landscape duplicate caught. The CLIP age/presentation labels (`ClipAttributes`) did **not** run: torch and Hugging Face are not available in this session, so that path is unverified.
- `generate.py --plan`, `prompts.py` samples, `defaults.py --dry-run`, `curate.py --dry-run`, `pack.py --dry-run` all ran in a CPU-only Python 3.13 venv.
- Hugging Face is not reachable from this session, so no model could be downloaded. `generate.py --dry-run` is therefore **unverified**; `curate.py` and `pack.py` ran on six Pillow placeholders (three cartoon faces, one blurred; two identical landscapes; one textured pet). Result: both landscapes' duplicate and the blur were caught, the Haar cascade did not see the cartoon faces (expected, it is a smoke-test fallback), and the face-accept, dedupe, balance-cap and face-centred-crop paths were exercised with a stub detector. The packed `index.json` was parsed by `loadPool` in a throwaway vitest.
- Size measurement on placeholders only: flat defaults 0.6 to 1.3 KB each, a noisy 256 px photo-like texture 21 KB. Real photos at 256 px WebP q80 typically land at 15 to 25 KB, so the projection for 3,000 is roughly 45 to 55 MB: under budget but not by much. Levers in `pack.py`: `--quality 75` or `--size 224`. Measure on the 200-image sample before committing to 256/q80.

## Licensing

### Model choice: Z-Image-Turbo (Tongyi-MAI, Apache-2.0)

Chosen because it is the strongest permissively licensed photoreal model that fits a consumer GPU in 2026: 6B parameters, 8 DiT forwards per image, bf16 peak ~16 GB (fits a 4080/4090 directly, a 12 GB card with offload or FP8), known for realistic skin and lighting rather than the "AI gloss" that SDXL checkpoints and FLUX tend to produce, and supported by diffusers (`ZImagePipeline`). Apache-2.0 allows commercial use of the weights and puts no claim on outputs. It uses no CFG, so negative prompts are ignored; the prompt matrix carries the "not a studio portrait" intent in positive terms.

Alternatives wired in:

- **FLUX.1-schnell** (Black Forest Labs, Apache-2.0): 12B, 4 steps, excellent prompt following; needs NF4 (`bitsandbytes`) or offload on 12 GB. The non-commercial `FLUX.1-dev` and `Krea-dev` were excluded. FLUX has a known "same face" tendency; the dedupe threshold matters more with it.
- **RealVisXL V5.0** (SDXL, CreativeML OpenRAIL++-M): permits commercial use under the licence's use restrictions, but the author has not answered the community's commercial-use question; needs 768 px minimum and negative prompts. Fallback only.
- Rejected: SD 3.5 (Stability Community licence, revenue cap and gated), Qwen-Image and HiDream (too large for 12 to 24 GB without heavy quantisation), Chroma (uncensored FLUX derivative, higher NSFW risk).

### Outputs

The Apache-2.0 model licences place no restriction on generated images. Whether the owner holds copyright in them is unsettled (the US Copyright Office does not register purely AI-generated images; UK CDPA s.9(3) is more favourable). For ICG this is secondary: the pool ships as a bundled asset and the Terms should state that generated Avatars are synthetic and depict no real person. Residual risk: a generated face can resemble a real person by chance; prompts never name anyone and the visual pass should drop lookalikes of public figures.

### Curation tooling

The curation models are all permissively licensed (F2: `insightface` and its non-commercial `buffalo_l` pack were removed).

| Component                                   | Role                                                   | Licence                                                                 | Source                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YuNet `face_detection_yunet_2023mar.onnx`   | face detection                                         | MIT (libfacedetection, Shiqi Yu; the zoo's `LICENSE` in that directory) | [opencv_zoo/models/face_detection_yunet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)                                                |
| SFace `face_recognition_sface_2021dec.onnx` | face embedding for dedupe                              | Apache-2.0                                                              | [opencv_zoo/models/face_recognition_sface](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface), [paper](https://arxiv.org/abs/2205.12010) |
| `openai/clip-vit-base-patch32`              | non-face dedupe, zero-shot age bucket and presentation | MIT                                                                     | [model card](https://huggingface.co/openai/clip-vit-base-patch32)                                                                                                   |
| `Falconsai/nsfw_image_detection`            | NSFW filter                                            | Apache-2.0                                                              | [model card](https://huggingface.co/Falconsai/nsfw_image_detection)                                                                                                 |
| OpenCV Haar cascade                         | offline dry-run fallback                               | BSD-style Intel licence in the cascade file header, library Apache-2.0  | ships inside `opencv-python-headless` < 5                                                                                                                           |

The task brief called YuNet Apache-2.0; the licence file in the zoo directory is MIT. Both are permissive and `fetch-models.py` downloads each licence file next to the model. The `models/CHECKSUMS` file pins the SHA-256 of both ONNX files and both licences (computed on first fetch here, and matching the LFS object ids the zoo publishes).

Age bucket and presentation are CLIP zero-shot guesses over a fixed label set (`AGE_LABELS`, `PRESENTATION_LABELS` in `curate.py`). They are approximate, are used only to balance the pool across cells and to reject apparent children and teenagers, and say nothing about any real person (the faces are synthetic). Only the coarse bucket is written to curation output; the probabilities are discarded, and the pool index keeps only coarse buckets. Zero-shot CLIP is weaker and more biased than a dedicated age/gender head, so treat the balance grid as a rough steer and the visual pass as the real check.

- Defaults: rendered from scratch, no Platform assets or logos used (PLAN.md trademark note). Colours are approximations for S5 to check against screenshots.

## Owner checklist

1. Create a Python 3.11/3.12 venv on the GPU machine and install as above, then `python scripts/fetch-models.py` and confirm it prints `ok` for all four files.
2. `python generate.py --dry-run` (downloads a ~10 MB test pipeline) and then `python generate.py --target 200`. Open `raw/face`: are they phone-camera candid, not studio? Adjust `prompts.py` axes before the big run. If 512 px output looks soft with Z-Image-Turbo, use `--size 768` (pack downsizes anyway, generation time roughly doubles).
3. `python curate.py --target 200`. Read `curated/curation-report.md`: rejection reasons, detected age x presentation grid, nearest-neighbour similarities. Tune `--face-dup` (0.363 default, the SFace same-identity cosine from the OpenCV Zoo model card; raise it, e.g. 0.45, if too many distinct faces collapse, lower it if look-alikes survive), `--max-minor-prob` (0.2), `--blur-threshold`, `--min-face-ratio`. Check the age x presentation grid against the prompted spread: CLIP labels are rough, so a mismatch is expected, a collapse into one cell is not.
4. Check that the report's `attributes` setting says `clip zero-shot` (it is `off` without `--embed clip`, and then nothing screens for apparent minors automatically).
5. `python defaults.py`, `python pack.py --target 3000`: confirm the projection is under 60 MB with the real images; otherwise `--quality 75` or `--size 224`.
6. Full run: `generate.py --target 3000` (resumes), `curate.py`, visual pass over `curated/` and `curated/_rejected/` (delete, do not move), `pack.py`.
7. Hand `pool/` to the Host builds (`index.json` + WebP files). Decide where the 50 to 60 MB lives: git LFS, R2 release asset, or a build step; it is `.gitignore`d here.
8. S5 (renderer fidelity) checks `defaults.py` palettes and silhouette proportions against real screenshots and updates `SILHOUETTE_PALETTES` / `SHAPES`.

## Findings with sources

1. **Z-Image-Turbo is the right default in 2026.** Apache-2.0, 6B, 8 steps, ~16 GB peak in bf16, consumer-GPU speeds of a few seconds per 1024 px image, photorealism that beats SDXL checkpoints and matches or beats FLUX for faces. Sources: [codesota: Z-Image-Turbo on consumer GPUs](https://codesota.com/news/z-image-turbo-consumer-gpu), [lilting.ch: Z-Image vs FLUX/SD](https://lilting.ch/en/articles/z-image-vs-flux-sd), [emergentmind summary (0.8 s at 512 px on H800, 16 GB peak)](https://api.emergentmind.com/topics/z-image-turbo), [saascrmreview (4090 ~2.3 s, 4070 3 to 4 s)](https://saascrmreview.com/?p=8069), [Atlas Cloud (5 to 10 s on consumer GPUs)](https://atlascloud.ai/models/z-image/turbo). Speed numbers are secondary sources; verify on the 200 sample.
2. **FLUX.1-schnell is Apache-2.0 and fits 12 GB only quantised or offloaded.** [Model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell) (4 steps, `guidance_scale=0`, `enable_model_cpu_offload`), [d-central (FP8 ~12 to 14 GB)](https://d-central.tech/ai/model/flux-1-schnell/).
3. **insightface's model pack is non-commercial, so it was replaced (F2).** The library is MIT but "ALL models are available for non-commercial research purposes only", including auto-downloaded `buffalo_l`. [model_zoo README](https://github.com/deepinsight/insightface/blob/e68b8b076fb11e9f75c87244d234385f0f318181/model_zoo/README.md), [PyPI page](https://pypi.org/project/insightface/). The replacement is OpenCV Zoo YuNet (MIT) and SFace (Apache-2.0), run through `cv2.FaceDetectorYN` / `cv2.FaceRecognizerSF`, which exist in OpenCV 4.8+ and in 5.0.0 (checked here); SFace's same-identity cosine threshold is 0.363 (L2 1.128).
4. **Permissive NSFW and embedding models exist.** [Falconsai/nsfw_image_detection, Apache-2.0](https://huggingface.co/Falconsai/nsfw_image_detection); OpenAI CLIP is MIT.
5. **RealVisXL's commercial status is unclear.** Tagged openrail++, the maintainer has not answered the commercial-use discussion. [Model page](https://huggingface.co/SG161222/RealVisXL_V5.0), [discussion](https://huggingface.co/SG161222/RealVisXL_V5.0/discussions/10).
6. **MediaPipe has no Python 3.13 wheels** (tested through 3.12; 3.13 fails to build). [MediaPipe build docs](https://ai.google.dev/edge/mediapipe/solutions/build_python), [issue 6159](https://github.com/google-ai-edge/mediapipe/issues/6159). Hence the 3.11/3.12 recommendation.
7. **OpenCV 5.0 removed `cv2.CascadeClassifier`** from the main module (hit with `opencv-python-headless` 5.0.0.93); the pipeline keeps `<5` for the Haar fallback. YuNet and SFace work on 5.0.0, so the pin can be dropped if the Haar fallback is.
8. **Face detectors do not see cartoon faces**, so a true offline smoke test of the face path needs one real photo in `raw-dry-run/face/`; the stub path was used here instead.

## Open questions

1. **Resolution.** Generate at 512 (fast) or 768 (safer quality for Z-Image-Turbo and FLUX, which were trained at 1024)? Decide on the 200 sample.
2. **Budget.** If real images land above ~20 KB each, q75 or 224 px? 224 px still covers the largest Avatar in any Template at 4K? (S5 should confirm the largest rendered Avatar diameter.)
3. **Default avatar fidelity.** Exact colours and silhouette shapes per Platform and theme belong to S5; `defaults.py` is parameterised for it. Should defaults carry both themes, or should the renderer tint one neutral silhouette?
4. **Pool distribution.** 50 to 60 MB of WebP in git (LFS) or as a release asset fetched at build time?
5. **Age floor.** Curation rejects faces CLIP puts at >= 0.2 child or teenager probability and prompts ask for adults only; CLIP has no 'under 20' cut, so is a stricter rule (reject also when 'young adult in their twenties' is low-confidence, or drop the youngest bucket) wanted to make "no minors" unambiguous at the cost of fewer young-adult faces?
