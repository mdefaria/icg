import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FRAME_PRESETS, type Language, type OverlaySpec } from "@icg/shared";
import { ALL_TEMPLATES, sampleComment, templateName } from "../src/fixtures";
import { loadNodeAssets, PACKAGE_PATHS } from "../src/node-assets";
import { renderCommentPng, renderOverlay } from "../src/render";
import { initRenderer } from "../src/wasm";

const out = PACKAGE_PATHS.samples;
mkdirSync(out, { recursive: true });
const tInit = performance.now();
await initRenderer();
console.log(`wasm init ${(performance.now() - tInit).toFixed(0)} ms`);
const base = loadNodeAssets();

const ES_SLOTS = new Set([1, 4, 7, 10, 13]);

const ms = (t: number) => `${t.toFixed(0)} ms`;

const timings: Array<{ name: string; total: number }> = [];

for (const [i, template] of ALL_TEMPLATES.entries()) {
  const language: Language = ES_SLOTS.has(i) ? "es" : "en";
  const assets = { ...base, locale: language };
  const comment = sampleComment(template.platform, language, i);
  const name = templateName(template);
  const spec: OverlaySpec = {
    comment,
    template,
    frame: FRAME_PRESETS["9:16"],
    placement: { x: 0.5, y: 0.62, scale: 0.92 },
  };
  const t0 = performance.now();
  const overlay = await renderOverlay(spec, assets);
  const t1 = performance.now();
  writeFileSync(join(out, `${name}.png`), overlay.png);
  const crop = await renderCommentPng(comment, template, 2, assets);
  const t2 = performance.now();
  writeFileSync(join(out, `${name}.crop2x.png`), crop);
  timings.push({ name, total: t1 - t0 });
  console.log(`${name.padEnd(30)} ${language}  frame ${ms(t1 - t0)}  card@2x ${ms(t2 - t1)}`);
}

const bench = async (label: string, spec: OverlaySpec, runs: number) => {
  const samples: number[] = [];
  let png: Uint8Array = new Uint8Array();
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    png = (await renderOverlay(spec, base)).png;
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  console.log(
    `${label}: median ${ms(median)} (min ${ms(samples[0]!)}, max ${ms(samples[samples.length - 1]!)}) over ${runs} runs, png ${(png.length / 1024).toFixed(0)} KB`,
  );
  return png;
};

const comment = sampleComment("tiktok", "en", 0);
const template = { platform: "tiktok", theme: "dark", variant: "creator-reply" } as const;
await bench(
  "1080x1920",
  { comment, template, frame: FRAME_PRESETS["9:16"], placement: { x: 0.5, y: 0.62, scale: 0.92 } },
  7,
);
await bench(
  "1920x1080",
  { comment, template, frame: FRAME_PRESETS["16:9"], placement: { x: 0.5, y: 0.7, scale: 0.8 } },
  5,
);
const uhd = await bench(
  "3840x2160",
  {
    comment,
    template,
    frame: { width: 3840, height: 2160 },
    placement: { x: 0.5, y: 0.7, scale: 1.6 },
  },
  3,
);
writeFileSync(join(out, "tiktok-dark-creator-reply.4k.png"), uhd);
console.log(`wrote ${timings.length} frames + crops to ${out}`);
