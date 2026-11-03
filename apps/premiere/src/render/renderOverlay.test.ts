import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-wasm";
import { describe, expect, it } from "vitest";
import {
  cardHeight,
  commentCardSvg,
  escapeXml,
  formatCount,
  inlineEmojiSvg,
  splitRuns,
  wrapText,
} from "./commentCard";
import { ensureWasm, renderOverlay } from "./renderOverlay";
import { sampleSpec } from "./sample";

const require = createRequire(import.meta.url);
const asset = (relative: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(relative, import.meta.url))));
const fonts = [
  asset("../../assets/fonts/Inter-Regular.ttf"),
  asset("../../assets/fonts/Inter-SemiBold.ttf"),
];
const emoji = {
  "🔥": readFileSync(
    fileURLToPath(new URL("../../assets/emoji/1f525.svg", import.meta.url)),
    "utf8",
  ),
};
const wasm = () =>
  Promise.resolve(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));

function png(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    signature: Array.from(bytes.slice(0, 8)),
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

describe("commentCardSvg helpers", () => {
  it("escapes xml and keeps emoji runs apart from text", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
    expect(splitRuns("wow 🔥🔥 ok", ["🔥"])).toEqual([
      { kind: "text", value: "wow " },
      { kind: "emoji", value: "🔥" },
      { kind: "emoji", value: "🔥" },
      { kind: "text", value: " ok" },
    ]);
  });

  it("wraps on word boundaries without dropping words", () => {
    expect(wrapText("the transition at 0:07 is actually insane, teach us 🔥", 32)).toEqual([
      "the transition at 0:07 is",
      "actually insane, teach us 🔥",
    ]);
    expect(wrapText("supercalifragilisticexpialidocious", 10)).toEqual([
      "supercalifragilisticexpialidocious",
    ]);
    expect(wrapText("", 10)).toEqual([""]);
  });

  it("formats like counts the way TikTok does", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(12400)).toBe("12.4K");
    expect(formatCount(1000)).toBe("1K");
    expect(formatCount(2_500_000)).toBe("2.5M");
  });

  it("nests an emoji svg with its own viewBox", () => {
    const nested = inlineEmojiSvg(
      '<svg xmlns="x" viewBox="0 0 36 36"><path d="M0 0"/></svg>',
      10,
      20,
      46,
    );
    expect(nested).toBe(
      '<svg x="10" y="20" width="46" height="46" viewBox="0 0 36 36"><path d="M0 0"/></svg>',
    );
  });

  it("produces a full-frame svg with the card centred at the Placement", () => {
    const svg = commentCardSvg(sampleSpec, emoji);
    expect(
      svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"'),
    ).toBe(true);
    expect(svg).toContain("mia.edits");
    expect(svg).toContain("teach us");
    expect(svg).toContain("12.4K");
    expect(svg).toContain('viewBox="0 0 36 36"');
    const height = cardHeight(2);
    expect(svg).toContain(`translate(${540 - 460} ${1920 * 0.7 - height / 2}) scale(1)`);
  });
});

describe("renderOverlay", () => {
  it("renders the sample Comment to a transparent 1080x1920 RGBA PNG", async () => {
    await ensureWasm(wasm);
    const overlay = renderOverlay(sampleSpec, { fonts, emoji });
    expect(overlay.frame).toEqual({ width: 1080, height: 1920 });
    expect(overlay.spec).toBe(sampleSpec);
    expect(png(overlay.png)).toEqual({
      signature: [137, 80, 78, 71, 13, 10, 26, 10],
      width: 1080,
      height: 1920,
      bitDepth: 8,
      colorType: 6,
    });
  });

  it("leaves the frame transparent outside the card and opaque inside it", async () => {
    await ensureWasm(wasm);
    const resvg = new Resvg(commentCardSvg(sampleSpec, emoji), {
      fitTo: { mode: "original" },
      font: { fontBuffers: fonts, defaultFontFamily: "Inter" },
    });
    const image = resvg.render();
    const pixels = image.pixels;
    const alphaAt = (x: number, y: number) => pixels[(y * 1080 + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(540, 100)).toBe(0);
    expect(alphaAt(540, Math.round(1920 * 0.7))).toBeGreaterThan(200);
    image.free();
    resvg.free();
  });

  it("reuses one wasm instance across calls", async () => {
    await ensureWasm(wasm);
    let loads = 0;
    await ensureWasm(() => {
      loads += 1;
      return wasm();
    });
    expect(loads).toBe(0);
  });
});
