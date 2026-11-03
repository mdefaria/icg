import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-wasm";
import {
  FRAME_PRESETS,
  type Language,
  type OverlaySpec,
  type Platform,
  type Template,
} from "@icg/shared";
import { bytesToDataUrl } from "../src/bytes";
import { ALL_TEMPLATES, sampleComment, templateName } from "../src/fixtures";
import { loadNodeAssets, PACKAGE_PATHS } from "../src/node-assets";
import { renderCommentPng, renderOverlay, type RenderOptions } from "../src/render";
import type { CardStyle } from "../src/templates/card";
import { initRenderer } from "../src/wasm";

const out = PACKAGE_PATHS.samples;
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".png")) rmSync(join(out, f));
await initRenderer();
const assets = loadNodeAssets();

type Sample = {
  name: string;
  template: Template;
  language: Language;
  index: number;
  card: CardStyle;
  seeTranslation?: boolean;
};

const EN_INDEX: Record<Platform, number[]> = {
  tiktok: [0, 2, 0, 3],
  instagram: [1, 0, 2, 0],
  youtube: [4, 0, 1, 0],
  x: [3, 0, 4, 2],
};

const samples: Sample[] = ALL_TEMPLATES.map((template, i) => ({
  name: templateName(template),
  template,
  language: "en",
  index: EN_INDEX[template.platform][i % 4]!,
  card: "sheet",
}));

for (const platform of ["tiktok", "instagram", "youtube", "x"] as const) {
  samples.push(
    {
      name: `${platform}-dark-creator-reply-es`,
      template: { platform, theme: "dark", variant: "creator-reply" },
      language: "es",
      index: 0,
      card: "sheet",
    },
    {
      name: `${platform}-light-single-es`,
      template: { platform, theme: "light", variant: "single" },
      language: "es",
      index: platform === "x" ? 2 : 1,
      card: "sheet",
      seeTranslation: platform !== "tiktok",
    },
    {
      name: `${platform}-${platform === "x" || platform === "youtube" ? "light" : "dark"}-single-transparent`,
      template: {
        platform,
        theme: platform === "x" || platform === "youtube" ? "light" : "dark",
        variant: "single",
      },
      language: "en",
      index: platform === "tiktok" ? 2 : 0,
      card: "transparent",
    },
  );
}

const FOOTAGE = (w: number, h: number, light: boolean) =>
  light
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3E7D3"/><stop offset="1" stop-color="#C9D6DF"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${w * 0.8}" cy="${h * 0.2}" r="${w * 0.3}" fill="#FFFFFF" fill-opacity="0.5"/>`
    : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B2735"/><stop offset="1" stop-color="#4A2C40"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${w * 0.25}" cy="${h * 0.3}" r="${w * 0.35}" fill="#F59E0B" fill-opacity="0.25"/>`;

function preview(png: Uint8Array, w: number, h: number, light: boolean): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${FOOTAGE(w, h, light)}<image width="${w}" height="${h}" href="${bytesToDataUrl("image/png", png)}"/></svg>`;
  const r = new Resvg(svg, { font: { loadSystemFonts: false } });
  return r.render().asPng();
}

const ms = (t: number) => `${t.toFixed(0)} ms`;
for (const s of samples) {
  const comment = sampleComment(s.template.platform, s.language, s.index);
  const options: RenderOptions = { card: s.card, seeTranslation: s.seeTranslation ?? false };
  const spec: OverlaySpec = {
    comment,
    template: s.template,
    frame: FRAME_PRESETS["9:16"],
    placement: { x: 0.5, y: 0.62, scale: 0.92 },
    language: s.language,
  };
  const t0 = performance.now();
  const overlay = await renderOverlay(spec, assets, options);
  const t1 = performance.now();
  writeFileSync(join(out, `${s.name}.png`), overlay.png);
  const crop = await renderCommentPng(comment, s.template, 2, assets, {
    ...options,
    language: s.language,
  });
  writeFileSync(join(out, `${s.name}.crop2x.png`), crop);
  if (s.card === "transparent") {
    writeFileSync(
      join(out, `${s.name}.preview.png`),
      preview(overlay.png, 1080, 1920, s.template.theme === "light"),
    );
  }
  const issues = [...overlay.missingEmoji, ...overlay.missingAvatars, ...overlay.unsupportedText];
  console.log(
    `${s.name.padEnd(38)} frame ${ms(t1 - t0)}${issues.length ? `  issues: ${issues.join(" ")}` : ""}`,
  );
}

const uhd = await renderOverlay(
  {
    comment: sampleComment("tiktok", "en", 0),
    template: { platform: "tiktok", theme: "dark", variant: "creator-reply" },
    frame: { width: 3840, height: 2160 },
    placement: { x: 0.5, y: 0.6, scale: 1.6 },
  },
  assets,
);
writeFileSync(join(out, "tiktok-dark-creator-reply.4k.png"), uhd.png);
console.log(`wrote ${samples.length} frames, crops and previews plus one 4K frame to ${out}`);
