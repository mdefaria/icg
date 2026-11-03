import { describe, expect, it } from "vitest";
import { formatCount } from "./format";

const en = (platform: "tiktok" | "instagram" | "youtube" | "x") => ({
  platform,
  language: "en" as const,
});
const es = (platform: "tiktok" | "instagram" | "youtube" | "x") => ({
  platform,
  language: "es" as const,
});

describe("formatCount (en)", () => {
  it("keeps small numbers plain", () => {
    expect(formatCount(0, en("tiktok"))).toBe("0");
    expect(formatCount(999, en("x"))).toBe("999");
  });

  it("abbreviates from 1,000 on YouTube and from 10,000 everywhere", () => {
    expect(formatCount(1234, en("youtube"))).toBe("1.2K");
    expect(formatCount(12_400, en("tiktok"))).toBe("12.4K");
    expect(formatCount(12_400, en("instagram"))).toBe("12.4K");
    expect(formatCount(1_200_000, en("x"))).toBe("1.2M");
    expect(formatCount(1_000_000, en("tiktok"))).toBe("1M");
  });

  it("follows each platform below 10,000", () => {
    expect(formatCount(1234, en("tiktok"))).toBe("1234");
    expect(formatCount(1234, en("x"))).toBe("1,234");
    expect(formatCount(1234, en("instagram"))).toBe("1,234");
  });

  it("floors rather than rounds", () => {
    expect(formatCount(1299, en("youtube"))).toBe("1.2K");
    expect(formatCount(999_999, en("tiktok"))).toBe("999.9K");
  });
});

describe("formatCount (es)", () => {
  it("uses mil and M with a decimal comma and dot grouping", () => {
    expect(formatCount(1234, es("x"))).toBe("1.234");
    expect(formatCount(1234, es("youtube"))).toBe("1,2 mil");
    expect(formatCount(12_400, es("tiktok"))).toBe("12,4 mil");
    expect(formatCount(1_200_000, es("instagram"))).toBe("1,2 M");
  });
});
