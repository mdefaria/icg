import { describe, expect, it } from "vitest";
import {
  createEmojiLoader,
  emojiFallbacks,
  emojiFileName,
  emojiSequences,
  isEmojiCluster,
  segmentEmoji,
} from "./emoji";

describe("segmentEmoji", () => {
  it("keeps plain text as one segment", () => {
    expect(segmentEmoji("hello world")).toEqual([{ kind: "text", text: "hello world" }]);
  });

  it("splits emoji out of text", () => {
    const segs = segmentEmoji("the ending??? 😭😭 I was NOT ready");
    expect(segs.map((s) => s.kind)).toEqual(["text", "emoji", "emoji", "text"]);
    expect(segs[1]).toEqual({ kind: "emoji", cluster: "😭", codepoints: [0x1f62d] });
  });

  it("keeps ZWJ sequences and skin tones as one cluster", () => {
    const segs = segmentEmoji("👨‍💻👍🏽❤️‍🔥");
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ codepoints: [0x1f468, 0x200d, 0x1f4bb] });
    expect(segs[1]).toMatchObject({ codepoints: [0x1f44d, 0x1f3fd] });
    expect(segs[2]).toMatchObject({ codepoints: [0x2764, 0xfe0f, 0x200d, 0x1f525] });
  });

  it("treats keycaps and flags as emoji, but digits and © as text", () => {
    expect(isEmojiCluster("#️⃣")).toBe(true);
    expect(isEmojiCluster("🇲🇽")).toBe(true);
    expect(isEmojiCluster("3")).toBe(false);
    expect(isEmojiCluster("©")).toBe(false);
    expect(isEmojiCluster("©️")).toBe(true);
    expect(isEmojiCluster("❤")).toBe(false);
    expect(isEmojiCluster("❤️")).toBe(true);
  });
});

describe("emojiFileName", () => {
  it("maps to Noto names without FE0F", () => {
    expect(emojiFileName("noto", [0x1f602])).toBe("emoji_u1f602.svg");
    expect(emojiFileName("noto", [0x2764, 0xfe0f])).toBe("emoji_u2764.svg");
    expect(emojiFileName("noto", [0x2764, 0xfe0f, 0x200d, 0x1f525])).toBe(
      "emoji_u2764_200d_1f525.svg",
    );
    expect(emojiFileName("noto", [0x1f44d, 0x1f3fd])).toBe("emoji_u1f44d_1f3fd.svg");
    expect(emojiFileName("noto", [0x23, 0xfe0f, 0x20e3])).toBe("emoji_u0023_20e3.svg");
    expect(emojiFileName("noto", [0xa9, 0xfe0f])).toBe("emoji_u00a9.svg");
  });

  it("maps to Twemoji names, keeping FE0F only inside ZWJ sequences", () => {
    expect(emojiFileName("twemoji", [0x1f602])).toBe("1f602.svg");
    expect(emojiFileName("twemoji", [0x2764, 0xfe0f])).toBe("2764.svg");
    expect(emojiFileName("twemoji", [0x2764, 0xfe0f, 0x200d, 0x1f525])).toBe(
      "2764-fe0f-200d-1f525.svg",
    );
    expect(emojiFileName("twemoji", [0x23, 0xfe0f, 0x20e3])).toBe("23-20e3.svg");
  });
});

describe("emojiFallbacks", () => {
  it("degrades skin tone and ZWJ sequences to the base emoji", () => {
    expect(emojiFallbacks([0x1f44d, 0x1f3fd])).toEqual([[0x1f44d, 0x1f3fd], [0x1f44d]]);
    expect(emojiFallbacks([0x2764, 0xfe0f, 0x200d, 0x1f525])).toEqual([
      [0x2764, 0xfe0f, 0x200d, 0x1f525],
      [0x2764, 0x200d, 0x1f525],
      [0x2764],
    ]);
  });
});

describe("createEmojiLoader", () => {
  it("falls back to the base emoji when the exact sequence is missing", () => {
    const loader = createEmojiLoader({ files: { noto: { "emoji_u1f44d.svg": "<svg/>" } } });
    expect(loader.svg("noto", [0x1f44d, 0x1f3fd])).toBe("<svg/>");
    expect(loader.svg("noto", [0x1f602])).toBeUndefined();
    expect(loader.svg("twemoji", [0x1f44d])).toBeUndefined();
  });

  it("fetches from a base URL once per file and rejects non-SVG bodies", async () => {
    const requested: string[] = [];
    const fake = (async (url: string) => {
      requested.push(url);
      if (url.endsWith("/twemoji/1f602.svg")) return new Response("<svg xmlns='x'/>");
      if (url.endsWith("/twemoji/1f480.svg")) return new Response("<html>404 page</html>");
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const loader = createEmojiLoader({ baseUrl: "https://cdn.example/emoji/", fetch: fake });
    await loader.prepare("twemoji", [[0x1f602], [0x1f480], [0x1f44d, 0x1f3fd]]);
    await loader.prepare("twemoji", [[0x1f602]]);
    expect(loader.svg("twemoji", [0x1f602])).toBe("<svg xmlns='x'/>");
    expect(loader.svg("twemoji", [0x1f480])).toBeUndefined();
    expect(requested).toEqual([
      "https://cdn.example/emoji/twemoji/1f602.svg",
      "https://cdn.example/emoji/twemoji/1f480.svg",
      "https://cdn.example/emoji/twemoji/1f44d-1f3fd.svg",
      "https://cdn.example/emoji/twemoji/1f44d.svg",
    ]);
  });

  it("reads through a host-supplied reader and records missing emoji", async () => {
    const loader = createEmojiLoader({
      read: async (set, file) =>
        set === "noto" && file === "emoji_u1f525.svg" ? "<svg/>" : undefined,
    });
    await loader.prepare("noto", [[0x1f525], [0x1f996]]);
    expect(loader.svg("noto", [0x1f525])).toBe("<svg/>");
    loader.noteMissing("🦖");
    expect(loader.missingEmoji()).toEqual(["🦖"]);
  });
});

describe("emojiSequences", () => {
  it("collects distinct clusters across texts", () => {
    expect(emojiSequences(["a 😂😂", "b 👍🏽", "😂"]).map((s) => s.cluster)).toEqual(["😂", "👍🏽"]);
  });
});
