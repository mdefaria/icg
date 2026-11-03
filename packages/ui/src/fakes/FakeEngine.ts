import type { Engine, GenerateOptions, RegenerableField } from "@icg/engine";
import type { Author, Avatar, Comment, Language, Reply, Tone } from "@icg/shared";

const TEXTS: Record<Language, Partial<Record<Tone, string[]>>> = {
  en: {
    hype: ["no way this is real 😭🔥", "the editing on this is insane", "ok this is fire 🔥"],
    funny: ["why did I watch this 6 times", "the cat at the end 💀", "my wifi when I need it most"],
    question: ["what camera is this?", "is there a part 2??", "song name please"],
    critical: ["the audio is a bit loud tbh", "ending felt rushed"],
    relatable: ["literally me every monday", "this is my whole personality"],
    emoji: ["😭😭😭", "🔥🔥", "👀"],
    request: ["do one about the making of!", "please post the full version"],
    story: ["the ending??? 😭", "I did not see that coming"],
    product: ["where is the jacket from?", "does it come in black?"],
  },
  es: {
    hype: ["no puede ser 😭🔥", "la edición es una locura", "esto está buenísimo 🔥"],
    funny: ["lo vi 6 veces y no sé por qué", "el gato del final 💀"],
    question: ["¿qué cámara es?", "¿hay segunda parte?", "¿cómo se llama la canción?"],
    critical: ["el audio está un poco alto", "el final fue muy rápido"],
    relatable: ["literal yo todos los lunes", "soy yo en todas mis versiones"],
    emoji: ["😭😭😭", "🔥🔥", "👀"],
    request: ["¡haz uno del detrás de cámaras!", "sube la versión completa porfa"],
    story: ["¿¿el final?? 😭", "no me lo esperaba"],
    product: ["¿de dónde es la chaqueta?", "¿la hay en negro?"],
  },
};

const REPLIES: Record<Language, string[]> = {
  en: ["part 2 soon 👀", "haha thank you!!", "shot on my phone 😂", "you'll see ✨"],
  es: ["¡segunda parte pronto! 👀", "jaja ¡gracias!", "grabado con el móvil 😂"],
};

const FIRST = ["lena", "javi", "sofia", "kat", "noa", "milo", "ari", "tomas", "yui", "dee"];
const SECOND = ["makes", "films", "edits", "vg", "rm", "daily", "cuts", "studio", "irl", "fx"];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FakeEngineOptions = { seed?: string; avatarIds?: string[] };

export class FakeEngine implements Engine {
  private readonly rng: () => number;
  private readonly avatarIds: string[];
  private counter = 0;

  constructor(options: FakeEngineOptions = {}) {
    this.rng = mulberry32(hash(options.seed ?? "icg"));
    this.avatarIds = options.avatarIds ?? [];
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)]!;
  }

  private avatar(): Avatar {
    if (this.avatarIds.length === 0) return { kind: "default", letter: this.pick(FIRST)[0]! };
    return { kind: "pool", id: this.pick(this.avatarIds) };
  }

  private author(options: GenerateOptions): Author {
    const first = this.pick(FIRST);
    const second = this.pick(SECOND);
    const sep =
      options.platform === "youtube" || options.platform === "x" ? "" : this.pick([".", "_"]);
    const digits = this.rng() < 0.3 ? String(Math.floor(this.rng() * 99)) : "";
    return {
      username: `${first}${sep}${second}${digits}`,
      displayName: first[0]!.toUpperCase() + first.slice(1),
      avatar: this.avatar(),
      verified: this.rng() < 0.1,
    };
  }

  private text(options: GenerateOptions): string {
    const bank = TEXTS[options.language];
    const tones = options.tones?.length ? options.tones : (Object.keys(bank) as Tone[]);
    const pool = tones.flatMap((tone) => bank[tone] ?? []);
    return this.pick(pool.length > 0 ? pool : (bank.hype ?? ["nice"]));
  }

  private likes(): number {
    return Math.floor(Math.pow(10, 1 + this.rng() * 4));
  }

  private timeAgo(): string {
    const unit = this.pick(["m", "h", "d", "w"]);
    const max = unit === "m" ? 59 : unit === "h" ? 23 : unit === "d" ? 6 : 4;
    return `${1 + Math.floor(this.rng() * max)}${unit}`;
  }

  private reply(options: GenerateOptions): Reply {
    return {
      author: options.creator ?? { ...this.author(options), verified: true },
      text: this.pick(REPLIES[options.language]),
      likes: Math.floor(this.likes() / 4),
      timeAgo: this.timeAgo(),
    };
  }

  generate(options: GenerateOptions): Comment {
    const comment: Comment = {
      id: `fake-${++this.counter}`,
      origin: "generated",
      author: this.author(options),
      text: this.text(options),
      likes: this.likes(),
      timeAgo: this.timeAgo(),
      pinned: false,
      likedByCreator: this.rng() < 0.2,
    };
    return options.variant === "creator-reply"
      ? { ...comment, reply: this.reply(options) }
      : comment;
  }

  generateMany(options: GenerateOptions, count: number): Comment[] {
    return Array.from({ length: count }, () => this.generate(options));
  }

  regenerate(comment: Comment, field: RegenerableField, options: GenerateOptions): Comment {
    switch (field) {
      case "text":
        return { ...comment, text: this.text(options) };
      case "author":
        return { ...comment, author: { ...this.author(options), avatar: comment.author.avatar } };
      case "avatar":
        return { ...comment, author: { ...comment.author, avatar: this.avatar() } };
      case "likes":
        return { ...comment, likes: this.likes() };
      case "timeAgo":
        return { ...comment, timeAgo: this.timeAgo() };
      case "reply":
        return { ...comment, reply: this.reply(options) };
    }
  }

  manual(options: GenerateOptions): Comment {
    const comment: Comment = {
      id: `fake-${++this.counter}`,
      origin: "manual",
      author: {
        username: "username",
        displayName: "",
        avatar: { kind: "default" },
        verified: false,
      },
      text: "",
      likes: 0,
      timeAgo: "1m",
      pinned: false,
      likedByCreator: false,
    };
    return options.variant === "creator-reply"
      ? { ...comment, reply: this.reply(options) }
      : comment;
  }
}
