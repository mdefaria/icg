import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-wasm";
import sharp from "sharp";
import { loadBundledFonts, PACKAGE_PATHS } from "../src/node-assets";
import { initRenderer } from "../src/wasm";

const AVATARS = [
  { id: "a-01", initials: "LM", from: "#F97316", to: "#DB2777", format: "png" },
  { id: "a-02", initials: "JR", from: "#0EA5E9", to: "#6366F1", format: "png" },
  { id: "a-03", initials: "SO", from: "#22C55E", to: "#0D9488", format: "png" },
  { id: "a-04", initials: "KT", from: "#A855F7", to: "#3B82F6", format: "png" },
  { id: "a-05", initials: "NV", from: "#EF4444", to: "#F59E0B", format: "jpg" },
  { id: "a-06", initials: "DC", from: "#64748B", to: "#1E293B", format: "webp" },
] as const;

function svg(a: (typeof AVATARS)[number]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient></defs>
<rect width="256" height="256" fill="url(#g)"/>
<circle cx="200" cy="56" r="70" fill="#fff" fill-opacity="0.12"/>
<text x="128" y="166" text-anchor="middle" font-family="Inter" font-weight="600" font-size="104" fill="#fff">${a.initials}</text>
</svg>`;
}

await initRenderer();
const fonts = loadBundledFonts();
mkdirSync(PACKAGE_PATHS.avatars, { recursive: true });
const entries = [];
for (const a of AVATARS) {
  const r = new Resvg(svg(a), { font: { fontBuffers: fonts.buffers(), loadSystemFonts: false } });
  const png = r.render().asPng();
  const bytes =
    a.format === "png"
      ? png
      : a.format === "jpg"
        ? await sharp(png).jpeg({ quality: 85 }).toBuffer()
        : await sharp(png).webp({ quality: 80 }).toBuffer();
  const file = `${a.id}.${a.format}`;
  writeFileSync(join(PACKAGE_PATHS.avatars, file), bytes);
  entries.push({ id: a.id, file, category: "face", tags: ["placeholder"], bytes: bytes.length });
  console.log(file, bytes.length, "bytes");
}
writeFileSync(
  join(PACKAGE_PATHS.avatars, "index.json"),
  JSON.stringify({ version: 1, size: 256, format: "mixed", entries }, null, 2) + "\n",
);
