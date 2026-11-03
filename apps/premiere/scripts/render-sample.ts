import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { commentCardSvg } from "../src/render/commentCard";
import { ensureWasm, renderOverlay } from "../src/render/renderOverlay";
import { sampleSpec } from "../src/render/sample";

const app = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const fonts = [
  new Uint8Array(readFileSync(join(app, "assets/fonts/Inter-Regular.ttf"))),
  new Uint8Array(readFileSync(join(app, "assets/fonts/Inter-SemiBold.ttf"))),
];
const emoji = { "🔥": readFileSync(join(app, "assets/emoji/1f525.svg"), "utf8") };
const out = process.argv[2] ?? join(tmpdir(), "icg-sample-overlay.png");

await ensureWasm(() =>
  Promise.resolve(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))),
);
const started = performance.now();
const overlay = renderOverlay(sampleSpec, { fonts, emoji });
writeFileSync(out, overlay.png);
writeFileSync(out.replace(/\.png$/, ".svg"), commentCardSvg(sampleSpec, emoji));
console.log(
  `${out} (${overlay.png.byteLength} bytes, ${Math.round(performance.now() - started)} ms)`,
);
