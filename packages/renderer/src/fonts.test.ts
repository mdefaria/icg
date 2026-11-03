import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "./bundled";
import { FontSet, matchWeight } from "./fonts";
import { loadBundledFonts } from "./node-assets";
import { esc } from "./svg";
import { initRenderer } from "./wasm";

const fonts = loadBundledFonts();

const SAMPLES = [
  "Hello world",
  "AVATAR Toyota WAVE",
  "the ending??? I was NOT ready",
  "office affluent fjord fly",
  "x->y --> a=>b 1x2 0:07 a!=b",
  "Responder · hace 2 h ¿qué? año ñandú",
  "W editor tutorial when",
];

function resvgAdvance(text: string, family: string, weight: number): number {
  const ink = (s: string) => {
    const r = new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="200"><text x="50" y="150" font-family="${family}" font-weight="${weight}" font-size="100" xml:space="preserve">${esc(s)}</text></svg>`,
      { font: { fontBuffers: fonts.buffers(), loadSystemFonts: false } },
    );
    const w = r.getBBox()!.width;
    r.free();
    return w;
  };
  return ink(`H${text}H`) - ink("HH");
}

describe("FontSet.measure", () => {
  beforeAll(async () => {
    await initRenderer();
  });

  for (const { family, weight } of BUNDLED_FONTS) {
    it(`matches resvg's shaped advance for ${family} ${weight}`, () => {
      const hh = fonts.measure("HH", family, weight, 100);
      for (const text of SAMPLES) {
        const measured = fonts.measure(`H${text}H`, family, weight, 100) - hh;
        expect(Math.abs(measured - resvgAdvance(text, family, weight))).toBeLessThan(0.6);
      }
    });
  }

  it("scales linearly with size and caches per face", () => {
    const a = fonts.measure("Reply", "Inter", 600, 13);
    expect(fonts.measure("Reply", "Inter", 600, 26)).toBeCloseTo(a * 2, 6);
    expect(fonts.measure("", "Inter", 600, 13)).toBe(0);
  });

  it("reports characters no face covers and still measures them", () => {
    expect(fonts.unsupported("abc 漢字 مرحبا")).toEqual(["漢", "字", "م", "ر", "ح", "ب", "ا"]);
    expect(fonts.measure("漢字", "Inter", 400, 15)).toBeGreaterThan(0);
  });

  it("measures with a fallback face when one is supplied", () => {
    let data: Uint8Array;
    try {
      data = new Uint8Array(readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"));
    } catch {
      return;
    }
    const withFallback = new FontSet([...fonts.faces, { family: "DejaVu", weight: 400, data }]);
    expect(withFallback.unsupported("مرحبا")).toEqual([]);
    expect(withFallback.measure("مرحبا", "Inter", 400, 100)).toBeGreaterThan(100);
  });

  it("ignores a fallback face it cannot parse", () => {
    const broken = new FontSet([
      ...fonts.faces,
      { family: "Broken", weight: 400, data: new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 1]) },
    ]);
    expect(broken.unsupported("漢")).toEqual(["漢"]);
    expect(broken.measure("漢 ok", "Inter", 400, 15)).toBeGreaterThan(0);
  });
});

describe("matchWeight", () => {
  it("follows CSS font matching", () => {
    expect(matchWeight([400, 500, 700], 600)).toBe(700);
    expect(matchWeight([400, 700], 500)).toBe(400);
    expect(matchWeight([500, 700], 400)).toBe(500);
    expect(matchWeight([400, 700], 300)).toBe(400);
    expect(matchWeight([400, 500], 800)).toBe(500);
  });

  it("resolves Roboto 600 to Bold like resvg does", () => {
    expect(fonts.resolve("Roboto", 600).weight).toBe(700);
  });
});
