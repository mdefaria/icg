import { describe, expect, it } from "vitest";
import { commentCardSvg, escapeXml, formatLikes, wrapText } from "./card";
import { SAMPLE_SPEC } from "./sample";

describe("wrapText", () => {
  it("wraps greedily on word boundaries", () => {
    expect(wrapText("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrapText("", 10)).toEqual([""]);
    expect(wrapText("supercalifragilistic", 5)).toEqual(["supercalifragilistic"]);
  });
});

describe("formatLikes", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatLikes(999)).toBe("999");
    expect(formatLikes(2419)).toBe("2.4K");
    expect(formatLikes(10_000)).toBe("10K");
    expect(formatLikes(1_200_000)).toBe("1.2M");
  });
});

describe("commentCardSvg", () => {
  it("produces a full-Frame SVG that mentions the Comment", () => {
    const svg = commentCardSvg(SAMPLE_SPEC);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1080" height="1920"/);
    expect(svg).toContain(escapeXml(SAMPLE_SPEC.comment.author.displayName));
    expect(svg).toContain('font-family="Inter"');
  });

  it("escapes markup in user text", () => {
    const svg = commentCardSvg({
      ...SAMPLE_SPEC,
      comment: { ...SAMPLE_SPEC.comment, text: '<script>"x" & y</script>' },
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;");
  });
});
