// Produces dist/plugin/, a folder the Adobe UXP Developer Tool can load as-is.
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "dist", "plugin");
const require = createRequire(import.meta.url);
const wasmPath = require.resolve("@resvg/resvg-wasm/index_bg.wasm");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "icons"), { recursive: true });

await build({
  entryPoints: [path.join(here, "plugin-src", "index.js")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outfile: path.join(out, "index.js"),
  // Provided by UXP's global `require` at runtime, never bundled.
  external: ["uxp", "fs", "os", "path"],
  legalComments: "none",
  logLevel: "warning",
});

const copies = [
  [path.join(here, "plugin-src", "manifest.json"), "manifest.json"],
  [path.join(here, "plugin-src", "index.html"), "index.html"],
  [wasmPath, "index_bg.wasm"],
  [path.join(here, "fonts", "Inter-Regular.ttf"), "Inter-Regular.ttf"],
  [path.join(here, "fonts", "LICENSE-Inter.txt"), "LICENSE-Inter.txt"],
];
for (const [from, to] of copies) {
  await cp(from, path.join(out, to));
}

// Panel icons, rendered by resvg itself so no binary is committed.
await initWasm(await readFile(wasmPath));
for (const [name, size] of [
  ["icon.png", 23],
  ["icon@2x.png", 46],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 23 23">
    <rect x="1" y="1" width="21" height="21" rx="5" fill="#4f7cff"/>
    <circle cx="8" cy="11.5" r="3" fill="#ffffff"/>
    <rect x="13" y="9" width="7" height="5" rx="1.5" fill="#ffffff"/>
  </svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  await writeFile(path.join(out, "icons", name), png);
}

console.log(`UXP plugin folder ready: ${out}`);
