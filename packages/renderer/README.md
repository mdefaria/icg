# @icg/renderer

Renders a Comment as an Overlay: a transparent full-Frame PNG with the Comment drawn at its Placement, from SVG Templates for TikTok, Instagram, YouTube and X (dark and light, single and creator reply), rasterised by `@resvg/resvg-wasm`. The same code runs in Node, in Electron (Resolve), in CEP's Chromium (Premiere) and in browsers (ADR 0003). No Host API is touched here.

Number formats and UI copy per Platform and language: [FORMATS.md](FORMATS.md).

## API

```ts
import { initRenderer, renderOverlay, renderOverlays, createBrowserAssets } from "@icg/renderer";
import { createNodeAssets, loadNodeAssets } from "@icg/renderer/node";

await initRenderer(source); // once per process; later calls return the same promise
const assets = createNodeAssets(); // or: await createBrowserAssets({ fontsBaseUrl, emojiBaseUrl, avatarsBaseUrl })
const overlay = await renderOverlay(spec, assets, { card: "sheet" });
overlay.png; // Uint8Array, spec.frame.width x spec.frame.height, RGBA PNG
overlay.missingEmoji; // clusters with no image in either emoji set (drawn as a blank advance)
overlay.missingAvatars; // e.g. "pool:ab12...: not found"; the Platform's default avatar is drawn instead
overlay.unsupportedText; // characters no loaded font covers (drawn as .notdef boxes)
```

| Export                                                                                                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initRenderer(source?)`                                                                                          | Initialises the wasm once. `source` may be a `WebAssembly.Module`, an `ArrayBuffer` or typed array, a `Response` (or a promise of one), a `URL` or a string. Strings and URLs are fetched when they are `http(s):`, `blob:` or `data:` or when there is no Node; otherwise read from disk (paths and `file:` URLs, so Electron and CEP with Node enabled work). With no argument it reads the wasm bundled in `@resvg/resvg-wasm` (Node only). A failed init can be retried. |
| `renderOverlay(spec, assets, options?)`                                                                          | Parses `spec` with the shared `OverlaySpec` schema, loads its emoji and Avatars, renders. `spec.language` (default `en`) sets UI copy and number formats.                                                                                                                                                                                                                                                                                                                    |
| `renderOverlays(specs, assets, options?)`                                                                        | Batch: parses every spec, prefetches all emoji and Avatars in parallel, renders in order on the same wasm instance and caches.                                                                                                                                                                                                                                                                                                                                               |
| `RenderOptions`                                                                                                  | zod schema: `card: "sheet" \| "transparent"` (default `sheet`: rounded dark or light card; `transparent`: the rows only, no background, for laying straight onto footage) and `seeTranslation: boolean` (default `false`, see FORMATS.md).                                                                                                                                                                                                                                   |
| `renderCommentPng(comment, template, scale, assets, options?)`                                                   | The card alone, cropped, at `3 x scale` px per pt. Used for crops, goldens and UI thumbnails.                                                                                                                                                                                                                                                                                                                                                                                |
| `renderCommentSvg` / `layoutCommentSvg`                                                                          | Synchronous SVG of the card, for a live preview in an `<img>`. Uses whatever the loaders already hold, so call `prepareComment(comment, template, assets)` first when the loaders fetch. Before `initRenderer` resolves, emoji are embedded as SVG instead of cached PNGs.                                                                                                                                                                                                   |
| `buildCard`                                                                                                      | Template layout without the outer `<svg>`: body, natural size in pt, and the three reports.                                                                                                                                                                                                                                                                                                                                                                                  |
| `formatCount(n, { platform, language })`, `copyFor(platform, language)`                                          | The number and copy rules from FORMATS.md.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `createEmojiLoader(source)`                                                                                      | `{ files }` (in memory), `{ baseUrl, fetch? }` (fetches `<baseUrl>/<noto                                                                                                                                                                                                                                                                                                                                                                                                     | twemoji>/<file>.svg`) or `{ read(set, file) }`(any Host storage). Fetches each file once, rejects bodies that are not SVG, tries the full sequence, then without VS16, without skin tone, then the base emoji.`missingEmoji()` accumulates every cluster that could not be drawn this session. |
| `createAvatarLoader({ pool?, files?, toPng? })`                                                                  | Resolves `pool` Avatars through `pool(id)` (sync or async) or an in-memory `files` map, `user` Avatars from their data URL. Bytes are sniffed, not trusted from the MIME label. PNG, JPEG and GIF go to resvg as they are; WebP (the pool's format) goes through `toPng`. Without a converter a WebP Avatar is reported and the default avatar drawn.                                                                                                                        |
| `poolResolver(index, read)`                                                                                      | Adapter for the `@icg/avatars` pool: accepts its `PoolIndex` (anything with `entries: [{ id, file }]`, parsed with zod) and returns a resolver that reads `file` for an id. No runtime dependency on `@icg/avatars`.                                                                                                                                                                                                                                                         |
| `avatarDirectory(read)`                                                                                          | Resolver over a directory: uses `index.json` when present, else `<id>.png/.webp/.jpg/.jpeg/.gif`.                                                                                                                                                                                                                                                                                                                                                                            |
| `createBrowserAssets({ fontsBaseUrl, emojiBaseUrl, avatarsBaseUrl, extraFonts?, fetch? })`                       | Browser and Electron loader mirroring the Node one: fetches the seven fonts, emoji on demand, Avatars through `index.json`, WebP converted with `createImageBitmap` + `OffscreenCanvas` (or a DOM canvas).                                                                                                                                                                                                                                                                   |
| `@icg/renderer/node`: `createNodeAssets({ fontsDir?, extraFonts?, emojiDir?, avatarsDir? })`, `loadNodeAssets()` | Node loader. Defaults: `fonts/`, `fixtures/emoji/`, `fixtures/avatars/`. WebP through `sharpToPng` (optional peer dependency `sharp`). `PACKAGE_PATHS.fullEmoji` points at the fetched full sets.                                                                                                                                                                                                                                                                            |
| `FontSet(faces)`                                                                                                 | Measurement (see below). Extra faces after the bundled ones act as fallbacks, for example a CJK or Arabic font a Host has on disk.                                                                                                                                                                                                                                                                                                                                           |

Natural size: the card is laid out in phone points and drawn at 3 px per pt (`DENSITY`), so `placement.scale = 1` matches a 1080 px wide phone screenshot. Placement `x`, `y` is the card centre, normalised to the Frame; a card partly outside the Frame is clipped.

### Avatars

- `pool`: by id through the resolver. The real pool (`packages/avatars`, 256 px WebP plus `index.json`) needs `toPng`; Node uses `sharp`, browsers and Electron use canvas.
- `user`: `data:image/(png|jpeg|gif|webp);base64,...`, validated with zod and sniffed. A malformed URL is reported as `user: invalid data URL`.
- `default`: with a `letter`, a coloured letter avatar whose colour is stable per username (Google-style palette). Without one, the Platform's grey silhouette in the theme's colours.
- Anything that fails falls back to `default` and shows up in `missingAvatars`.

### Emoji

Emoji are inline images, not font glyphs (ADR 0003). Text is segmented with `Intl.Segmenter` and Unicode emoji properties; each cluster is drawn as a 1.16 em image on a 1.3 em advance. Noto for TikTok, Instagram and YouTube, Twemoji for X. When the Platform's set lacks a cluster, or its SVG cannot be rasterised, the other set is used; only when both fail is it reported.

Each distinct emoji SVG is rasterised once by resvg into a power-of-two size bucket (64 to 512 px) and cached as a PNG (LRU, 2,048 entries), because resvg re-renders nested SVG images on every render.

Fixtures: 17 Noto and 17 Twemoji SVGs in `fixtures/emoji/` (147 KB), enough for tests and samples. The complete sets come from `scripts/fetch-emoji.ts`:

```sh
pnpm --filter @icg/renderer fetch-emoji              # both sets into assets/emoji/{noto,twemoji} (gitignored)
pnpm --filter @icg/renderer fetch-emoji -- --set twemoji --out /path/to/host/emoji
```

It downloads pinned npm tarballs (so it works wherever `pnpm install` works), checks their sha512 against the registry, keeps only files that parse as SVG, renames Noto files to Noto's own scheme (`emoji_u0023_20e3.svg`), and writes the licence files next to the SVGs: `noto/LICENSE` (Apache-2.0) and `noto/NOTICE`, `twemoji/LICENSE` (MIT, code) and `twemoji/LICENSE-GRAPHICS` (CC-BY 4.0; the app's credits must attribute Twemoji). Hosts serve that directory as `emojiBaseUrl` or `emojiDir`.

Measured on the full sets (Nov 2026):

| Set     | Source                                                               | Files | Raw     | Gzipped per file | Tarball | Raster at 64 px |
| ------- | -------------------------------------------------------------------- | ----- | ------- | ---------------- | ------- | --------------- |
| Noto    | `nomoji@18.0.0` (googlefonts/noto-emoji `svg/` + waved region flags) | 3,972 | 50.9 MB | 21.2 MB          | 15.9 MB | 1.7 ms avg      |
| Twemoji | `@discordapp/twemoji@16.0.1`                                         | 3,846 | 8.7 MB  | 3.8 MB           | 1.7 MB  | 0.6 ms avg      |

Two Noto files make resvg-wasm 2.6.2 panic (`emoji_u1f3f3_200d_1f308.svg` rainbow flag, `emoji_u1f4e6.svg` package); the renderer survives the panic and draws Twemoji's instead. 170 of the Noto files are Illustrator exports with a DOCTYPE internal subset; they render correctly. `src/full-emoji.test.ts` runs against the full sets when they are present and is skipped otherwise.

Delivery suggestion for the Hosts: ship Twemoji complete (1.7 MB compressed); ship Noto as the 15.9 MB pack, or only the emoji the Bank uses plus the pack fetched on first use on the web.

## Fonts and measurement

Inter 400/500/600/700 and Roboto 400/500/700 as static TTFs in `fonts/` (1.01 MB): resvg ignores variation axes. Substitutes: TikTok Sans / SF Pro and Chirp use Inter, YouTube uses Roboto. `scripts/instance-fonts.py` produces them (fonttools) and drops the `calt` feature: rustybuzz applied it at render time (Inter turns `->` into an arrow and `1x2` into `1×2`) where the measurer could not, and SF Pro / Chirp show those sequences literally anyway.

Wrapping (`src/wrap.ts`) measures with a small shaper over the fonts' own tables (`src/fonts.ts`, via opentype.js): cmap, GSUB `liga` ligatures (Roboto's fi/fl), and every GPOS `kern` pair-adjustment lookup (formats 1 and 2) of the `latn` default language system. `src/fonts.test.ts` checks all seven faces against resvg's own shaped advance and agrees within 0.6 px at 100 px. Weights resolve with CSS font matching (`matchWeight`), so Roboto 600 measures as Bold, which is what resvg draws.

Breaks: at spaces, between emoji, between ideographs (Han, kana, CJK punctuation), and inside a word only when the word alone is wider than the line (on grapheme boundaries). Explicit newlines are kept.

Scripts the bundled fonts do not cover (CJK, Arabic, Cyrillic, Greek): measured with the first fallback face in the `FontSet` that has the glyph, which is how resvg picks its fallback; with no such face they measure and draw as Inter's `.notdef` box and are listed in `unsupportedText`. Nothing crashes and lines still wrap. Arabic is shaped and reordered by resvg within a line but lines are left-aligned and the measurer does not shape it, so widths are approximate. A Host that wants these scripts passes e.g. Noto Sans CJK and Noto Sans Arabic as `extraFonts`.

## Performance

`pnpm --filter @icg/renderer bench` (Node 22, this container, TikTok dark creator-reply: 3 emoji, 2 pool Avatars, 6 lines, warm caches):

| Frame     | Median | PNG    | Budget |
| --------- | ------ | ------ | ------ |
| 1080x1920 | 67 ms  | 71 KB  | 150 ms |
| 1920x1080 | 62 ms  | 66 KB  |        |
| 3840x2160 | 168 ms | 162 KB | 400 ms |

wasm init 37 ms; the first render of a session costs ~300 ms (fonts parsed for measurement, emoji rasterised, Avatars decoded); `renderOverlays` of 12 1080x1920 Overlays 851 ms. The bench exits non-zero when a budget is missed.

What made 4K fast: resvg rasterises only the card's pixel box, and the full Frame is written by our own PNG encoder (`src/png.ts`: Sub-filtered rows, transparent rows outside the card, `node:zlib` in Node and `CompressionStream` elsewhere; resvg's whole-Frame path is kept as a fallback). resvg's own PNG encoder was the 4K floor (~250 ms for an empty Frame). `src/render.test.ts` checks the output against a whole-Frame resvg render. CEP and Electron numbers still need measuring on real machines.

## Bundle sizes

| Asset                                                 | Size             |
| ----------------------------------------------------- | ---------------- |
| `@resvg/resvg-wasm` `index_bg.wasm`                   | 2.48 MB          |
| Fonts (7 static TTFs)                                 | 1.01 MB          |
| Emoji fixtures (17 + 17 SVGs)                         | 147 KB           |
| Avatar fixtures (4 PNG, 1 JPEG, 1 WebP, `index.json`) | 125 KB           |
| `opentype.js` (measurement)                           | ~400 KB minified |

## Scripts

```sh
pnpm --filter @icg/renderer test            # unit, golden and render tests
pnpm --filter @icg/renderer golden:update   # re-baseline fixtures/golden after an intentional Template change
pnpm --filter @icg/renderer samples         # samples/*.png: frames, 2x crops, transparent previews, one 4K frame
pnpm --filter @icg/renderer bench           # timings against the budgets
pnpm --filter @icg/renderer fetch-emoji     # full emoji sets
pnpm --filter @icg/renderer exec tsx scripts/make-avatars.ts   # placeholder Avatar fixtures
```

Samples: `samples/<platform>-<theme>-<variant>.png` (16, English), `...-es.png` (two per Platform, Spanish, one with "see translation"), `...-transparent.png` plus `.preview.png` composited on mock footage (one per Platform), `*.crop2x.png` for each, and `tiktok-dark-creator-reply.4k.png`.

## Known gaps

Every layout is from knowledge of the current mobile apps, not from reference screenshots; one session with a phone and the four apps in both languages should settle these before launch.

- TikTok: position and colour of "Pinned" (drawn red before the time) and "Creator" (red after the name) are from memory; the newer dislike button is not drawn; the like column follows the classic layout (heart above count).
- Instagram: dark sheet colour (#262626) and whether "Liked by creator" carries text or only the avatar-heart badge; the verified badge is a generated 12-lobe scalloped seal, close but not the exact outline.
- YouTube: the dislike icon is the like icon rotated (Material style, cuff on the right); YouTube's own icon is the like mirrored vertically. The Shorts sheet colour (#212121 dark) is from memory. Roboto's fi/fl ligatures are drawn as Android draws them.
- X: Chirp is replaced by Inter (narrower, different "a"); the bookmark icon is dropped when four wide counts do not fit.
- Spanish TikTok may use `K` rather than `mil`.
- All Platforms: Avatars in samples are placeholders with initials; a light `sheet` gets a 0.5 pt hairline instead of a shadow; `transparent` cards have no legibility aid (no text shadow), by design.
- RTL comments are left-aligned and their widths approximate; CJK and Arabic need Host-supplied fonts to draw.
- The emoji raster cache lives in process memory; a Host could persist the PNGs to make the first render of a session cheaper.
- Measured in Node only; Premiere (CEP) and Resolve (Electron) timings need a real machine.
