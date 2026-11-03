import { describe, expect, it } from "vitest";
import { lineText, tokenize, wrapText } from "./wrap";

const mono = (text: string) => Array.from(text).length * 10;
const opts = { measure: mono, emojiWidth: 12 };

describe("tokenize", () => {
  it("splits words, spaces, emoji and newlines", () => {
    expect(tokenize("hi there 😂\nok").map((t) => t.kind)).toEqual([
      "word",
      "space",
      "word",
      "space",
      "emoji",
      "newline",
      "word",
    ]);
  });
});

describe("wrapText", () => {
  it("breaks at spaces and drops the trailing space", () => {
    const lines = wrapText("the quick brown fox jumps", { ...opts, maxWidth: 100 });
    expect(lines.map(lineText)).toEqual(["the quick", "brown fox", "jumps"]);
    expect(lines[0]!.width).toBe(90);
  });

  it("splits a word longer than the line", () => {
    const lines = wrapText("supercalifragilistic", { ...opts, maxWidth: 80 });
    expect(lines.map(lineText)).toEqual(["supercal", "ifragili", "stic"]);
  });

  it("keeps emoji clusters atomic and lets them break between each other", () => {
    const lines = wrapText("😂😂😂😂😂😂😂😂😂", { ...opts, maxWidth: 50 });
    expect(lines.map(lineText)).toEqual(["😂😂😂😂", "😂😂😂😂", "😂"]);
    expect(lines[0]!.runs.every((r) => r.kind === "emoji")).toBe(true);
  });

  it("positions emoji runs after the measured text before them", () => {
    const [line] = wrapText("hi 👍🏽 yo", { ...opts, maxWidth: 500 });
    const runs = line!.runs;
    expect(runs.map((r) => r.kind)).toEqual(["text", "emoji", "text"]);
    expect(runs[1]!.x).toBe(30);
    expect(runs[2]!.x).toBe(42);
    expect(runs[2]!.kind === "text" && runs[2]!.text).toBe(" yo");
  });

  it("honours explicit newlines", () => {
    expect(wrapText("a\nb\n\nc", { ...opts, maxWidth: 500 }).map(lineText)).toEqual([
      "a",
      "b",
      "",
      "c",
    ]);
  });

  it("truncates with an ellipsis at maxLines", () => {
    const lines = wrapText("one two three four five six", { ...opts, maxWidth: 100, maxLines: 2 });
    expect(lines).toHaveLength(2);
    expect(lineText(lines[1]!)).toBe("three fou…");
    expect(lines[1]!.width).toBeLessThanOrEqual(100);
  });

  it("returns one empty line for empty text", () => {
    expect(wrapText("", { ...opts, maxWidth: 100 })).toEqual([{ runs: [], width: 0 }]);
  });

  it("breaks between ideographs and keeps Latin runs whole", () => {
    const lines = wrapText("我们今天去看电影吧 ok", { ...opts, maxWidth: 40 });
    expect(lines.map(lineText)).toEqual(["我们今天", "去看电影", "吧 ok"]);
  });

  it("wraps Arabic at spaces without crashing", () => {
    const lines = wrapText("مرحبا بالعالم هذا رائع", { ...opts, maxWidth: 80 });
    expect(lines.map(lineText)).toEqual(["مرحبا", "بالعالم", "هذا رائع"]);
  });

  it("breaks a very long token, an emoji run and a URL inside a line", () => {
    const lines = wrapText("see https://example.com/a/very/long/path 😂😂😂", {
      ...opts,
      maxWidth: 100,
    });
    expect(lines.every((l) => l.width <= 100)).toBe(true);
    expect(lines.map(lineText).join("")).toBe("seehttps://example.com/a/very/long/path 😂😂😂");
  });

  it("does not split grapheme clusters when breaking a long word", () => {
    const word = "e\u0301".repeat(12);
    const lines = wrapText(word, { ...opts, maxWidth: 60 });
    expect(lines.every((l) => !lineText(l).startsWith("\u0301"))).toBe(true);
  });
});
