import { FRAME_PRESETS, type OverlaySpec } from "@icg/shared";
import { sampleComment } from "../src/fixtures";
import { loadNodeAssets } from "../src/node-assets";
import { renderOverlay, renderOverlays } from "../src/render";
import { initRenderer } from "../src/wasm";

const BUDGET_MS = { "1080x1920": 150, "3840x2160": 400 } as Record<string, number>;

const t0 = performance.now();
await initRenderer();
const initMs = performance.now() - t0;
const assets = loadNodeAssets();
const comment = sampleComment("tiktok", "en", 0);
const template = { platform: "tiktok", theme: "dark", variant: "creator-reply" } as const;

const cases: Array<[string, OverlaySpec, number]> = [
  [
    "1080x1920",
    {
      comment,
      template,
      frame: FRAME_PRESETS["9:16"],
      placement: { x: 0.5, y: 0.62, scale: 0.92 },
    },
    15,
  ],
  [
    "1920x1080",
    { comment, template, frame: FRAME_PRESETS["16:9"], placement: { x: 0.5, y: 0.7, scale: 0.8 } },
    9,
  ],
  [
    "3840x2160",
    {
      comment,
      template,
      frame: { width: 3840, height: 2160 },
      placement: { x: 0.5, y: 0.6, scale: 1.6 },
    },
    9,
  ],
];

const firstStart = performance.now();
await renderOverlay(cases[0]![1], assets);
console.log(
  `wasm init ${initMs.toFixed(0)} ms, first render (cold emoji + avatar caches) ${(performance.now() - firstStart).toFixed(0)} ms`,
);

let failed = false;
for (const [label, spec, runs] of cases) {
  const samples: number[] = [];
  let bytes = 0;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    bytes = (await renderOverlay(spec, assets)).png.length;
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  const budget = BUDGET_MS[label];
  const verdict =
    budget === undefined ? "" : median <= budget ? `  ok (< ${budget} ms)` : `  OVER ${budget} ms`;
  if (budget !== undefined && median > budget) failed = true;
  console.log(
    `${label}: median ${median.toFixed(0)} ms (min ${samples[0]!.toFixed(0)}, max ${samples[samples.length - 1]!.toFixed(0)}, ${runs} runs), png ${(bytes / 1024).toFixed(0)} KB${verdict}`,
  );
}

const batch = Array.from({ length: 12 }, (_, i) => ({
  ...cases[0]![1],
  comment: sampleComment("tiktok", "en", i),
  placement: { x: 0.5, y: 0.3 + (i % 6) * 0.08, scale: 0.92 },
}));
const batchStart = performance.now();
await renderOverlays(batch, assets);
console.log(`renderOverlays: 12 x 1080x1920 in ${(performance.now() - batchStart).toFixed(0)} ms`);
if (failed) process.exitCode = 1;
