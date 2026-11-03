import { Comment, Platform } from "@icg/shared";
import type { Author, BankEntry, Language } from "@icg/shared";
import { describe, expect, it } from "vitest";
import {
  createEngine,
  createRng,
  FIXTURE_BANK,
  fixtureAvatarPicker,
  USERNAME_RULES,
} from "./index";
import type { GenerateOptions, RegenerableField } from "./index";
import { parseAge } from "./time";

const deps = { bank: FIXTURE_BANK, pickAvatar: fixtureAvatarPicker };
const engine = (seed = "test") => createEngine(deps, createRng(seed));
const opts = (o: Partial<GenerateOptions> = {}): GenerateOptions => ({
  platform: "tiktok",
  language: "en",
  variant: "single",
  ...o,
});
const PLATFORMS = Platform.options;

const creator: Author = {
  username: "nico.cuts",
  displayName: "Nico",
  avatar: { kind: "pool", id: "a-04" },
  verified: true,
};

describe("createRng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = createRng("s");
    const b = createRng("s");
    const c = createRng("t");
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("generate", () => {
  it("is deterministic for a fixed engine seed", () => {
    const a = engine("fixed").generateMany(opts({ variant: "creator-reply" }), 10);
    const b = engine("fixed").generateMany(opts({ variant: "creator-reply" }), 10);
    expect(a).toEqual(b);
  });

  it("reproduces a Comment from options.seed regardless of history", () => {
    const e = engine("a");
    e.generateMany(opts(), 20);
    expect(e.generate(opts({ seed: "x" }))).toEqual(engine("b").generate(opts({ seed: "x" })));
  });

  it("produces Comments that parse, on every Platform, language and variant", () => {
    const e = engine();
    for (const platform of PLATFORMS) {
      for (const language of ["en", "es"] as const) {
        for (const variant of ["single", "creator-reply"] as const) {
          for (const c of e.generateMany(opts({ platform, language, variant }), 30)) {
            expect(() => Comment.parse(c)).not.toThrow();
            expect(c.origin).toBe("generated");
            expect(c.text.length).toBeGreaterThan(0);
            if (variant === "creator-reply") expect(c.reply).toBeDefined();
            else expect(c.reply).toBeUndefined();
          }
        }
      }
    }
  });

  it("honours language, tone, platform and context filters", () => {
    const e = engine();
    const filters: Array<Partial<GenerateOptions>> = [
      { language: "es", tones: ["question"], platform: "youtube" },
      { language: "en", tones: ["product"], contexts: ["ad"], platform: "instagram" },
      { language: "en", tones: ["funny", "hype"], platform: "x" },
      { language: "es", contexts: ["music"], platform: "tiktok" },
    ];
    for (const f of filters) {
      const o = opts(f);
      for (let i = 0; i < 60; i++) {
        const c = e.generate(o);
        const entry = sourceEntry(c.text, o.language);
        expect(entry.language).toBe(o.language);
        if (o.tones) expect(o.tones).toContain(entry.tone);
        if (entry.platforms.length) expect(entry.platforms).toContain(o.platform);
        if (o.contexts && entry.contexts.length) {
          expect(entry.contexts.some((x) => o.contexts!.includes(x))).toBe(true);
        }
      }
    }
  });

  it("relaxes filters instead of failing when nothing matches", () => {
    const c = engine().generate(opts({ tones: ["product"], contexts: ["music"], platform: "x" }));
    expect(c.text.length).toBeGreaterThan(0);
  });

  it("throws when the Bank has no entries in the language", () => {
    const enOnly = FIXTURE_BANK.filter((e) => e.language === "en");
    const e = createEngine({ bank: enOnly, pickAvatar: fixtureAvatarPicker }, createRng("x"));
    expect(() => e.generate(opts({ language: "es" }))).toThrow(/no entries/);
  });

  it("avoids repeating the last 50 entries within an engine", () => {
    const bank: BankEntry[] = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      language: "en",
      tone: "hype",
      text: `text ${i}`,
      platforms: [],
      contexts: [],
      weight: 1,
    }));
    const e = createEngine({ bank, pickAvatar: fixtureAvatarPicker }, createRng("ring"));
    const texts = Array.from({ length: 50 }, () => e.generate(opts()).text);
    expect(new Set(texts).size).toBe(50);
  });

  it("fills slots", () => {
    const bank: BankEntry[] = [
      {
        id: "s",
        language: "en",
        tone: "hype",
        text: "{creator} x{n} {emoji}",
        platforms: [],
        contexts: [],
        weight: 1,
      },
    ];
    const e = createEngine({ bank, pickAvatar: fixtureAvatarPicker }, createRng("slots"));
    const c = e.generate(opts({ creator }));
    expect(c.text).toMatch(/^Nico x(\d+) (🔥|💯|🙌|😍|✨|👏|🤩)$/);
    const n = Number(/x(\d+)/.exec(c.text)![1]);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(12);
    for (const c2 of engine().generateMany(opts(), 40)) expect(c2.text).not.toMatch(/\{\w+\}/);
  });

  it("attaches a creator reply authored by options.creator, younger than the Comment", () => {
    for (const c of engine().generateMany(
      opts({ variant: "creator-reply", creator, platform: "instagram" }),
      30,
    )) {
      expect(c.reply?.author).toEqual(creator);
      expect(c.reply!.text.length).toBeGreaterThan(0);
      expect(parseAge(c.reply!.timeAgo)!).toBeLessThanOrEqual(parseAge(c.timeAgo)!);
    }
  });

  it("generates a verified creator when none is given", () => {
    const [a, b] = engine().generateMany(opts({ variant: "creator-reply" }), 2);
    expect(a!.reply!.author.verified).toBe(true);
    expect(a!.reply!.author).toEqual(b!.reply!.author);
  });

  it("sets action-row counts on X and YouTube only", () => {
    const e = engine();
    const x = e.generate(opts({ platform: "x" }));
    expect(x.replies).toBeTypeOf("number");
    expect(x.reposts).toBeTypeOf("number");
    expect(x.views!).toBeGreaterThan(x.likes);
    const yt = e.generate(opts({ platform: "youtube" }));
    expect(yt.replies).toBeTypeOf("number");
    expect(yt.views).toBeUndefined();
    const tt = e.generate(opts({ platform: "tiktok" }));
    expect(tt.replies).toBeUndefined();
  });
});

describe("generateMany", () => {
  it("returns distinct entries and authors within a batch", () => {
    for (const language of ["en", "es"] as const) {
      const batch = engine().generateMany(opts({ language, variant: "creator-reply" }), 25);
      expect(batch).toHaveLength(25);
      expect(new Set(batch.map((c) => sourceEntry(c.text, language).id)).size).toBe(25);
      expect(new Set(batch.map((c) => c.author.username)).size).toBe(25);
      expect(new Set(batch.map((c) => c.id)).size).toBe(25);
    }
  });

  it("still fills a batch larger than the matching pool", () => {
    const batch = engine().generateMany(opts({ tones: ["emoji"] }), 10);
    expect(batch).toHaveLength(10);
  });
});

describe("regenerate", () => {
  const fields: RegenerableField[] = ["text", "author", "avatar", "likes", "timeAgo", "reply"];
  const changes: Record<RegenerableField, Array<keyof Comment>> = {
    text: ["text"],
    author: ["author"],
    avatar: ["author"],
    likes: ["likes", "replies", "reposts", "views"],
    timeAgo: ["timeAgo", "reply"],
    reply: ["reply"],
  };

  for (const field of fields) {
    it(`changes only ${field}`, () => {
      const e = engine(`regen-${field}`);
      const o = opts({ platform: "x", variant: "creator-reply" });
      for (let i = 0; i < 20; i++) {
        const c = e.generate(o);
        const next = e.regenerate(c, field, o);
        expect(() => Comment.parse(next)).not.toThrow();
        for (const key of Object.keys({ ...c, ...next }) as Array<keyof Comment>) {
          if (!changes[field].includes(key)) expect(next[key], key).toEqual(c[key]);
        }
      }
    });
  }

  it("author keeps verified and avatar changes only the avatar", () => {
    const e = engine("parts");
    const c = e.generate(opts());
    const a = e.regenerate(c, "author", opts());
    expect(a.author.username).not.toBe(c.author.username);
    expect(a.author.verified).toBe(c.author.verified);
    const v = e.regenerate(c, "avatar", opts());
    expect(v.author.avatar).not.toEqual(c.author.avatar);
    expect({ ...v.author, avatar: null }).toEqual({ ...c.author, avatar: null });
  });

  it("text produces different text", () => {
    const e = engine("t");
    const c = e.generate(opts());
    expect(e.regenerate(c, "text", opts()).text).not.toBe(c.text);
  });

  it("reply keeps the reply author and stays younger than the Comment", () => {
    const e = engine("r");
    const o = opts({ variant: "creator-reply", creator });
    const c = e.generate(o);
    const next = e.regenerate(c, "reply", o);
    expect(next.reply!.author).toEqual(c.reply!.author);
    expect(parseAge(next.reply!.timeAgo)!).toBeLessThanOrEqual(parseAge(next.timeAgo)!);
  });

  it("never touches the text of a Manual Comment unless asked", () => {
    const e = engine("m");
    const o = opts({ variant: "creator-reply" });
    const typed = { ...e.manual(o), text: "my own words" };
    typed.reply = { ...typed.reply!, text: "my reply" };
    for (const field of fields.filter((f) => f !== "text")) {
      const next = e.regenerate(typed, field, o);
      expect(next.text).toBe("my own words");
      expect(next.reply?.text).toBe("my reply");
      expect(next.origin).toBe("manual");
    }
    const withText = e.regenerate(typed, "text", o);
    expect(withText.text).not.toBe("my own words");
    expect(withText.origin).toBe("manual");
  });

  it("rejects a Comment that does not parse", () => {
    const c = { ...engine().generate(opts()), likes: -1 };
    expect(() => engine().regenerate(c, "likes", opts())).toThrow();
  });
});

describe("manual", () => {
  it("returns an empty, generated-author Manual Comment", () => {
    for (const platform of PLATFORMS) {
      const c = engine().manual(opts({ platform, variant: "creator-reply" }));
      expect(Comment.parse(c)).toEqual(c);
      expect(c.origin).toBe("manual");
      expect(c.text).toBe("");
      expect(c.pinned).toBe(false);
      expect(c.likedByCreator).toBe(false);
      expect(c.author.verified).toBe(false);
      expect(c.author.username).toMatch(USERNAME_RULES[platform]);
      expect(c.reply?.text).toBe("");
    }
  });
});

function sourceEntry(text: string, language: Language = "en"): BankEntry {
  for (const entry of FIXTURE_BANK.filter((e) => e.language === language)) {
    const pattern = entry.text
      .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
      .replace(/\{creator\}/g, ".+")
      .replace(/\{n\}/g, "\\d+")
      .replace(/\{emoji\}/g, "\\p{Extended_Pictographic}[\\uFE0F\\u{1F3FB}-\\u{1F3FF}]?");
    if (new RegExp(`^${pattern}$`, "u").test(text)) return entry;
  }
  throw new Error(`no Bank entry produced "${text}"`);
}
