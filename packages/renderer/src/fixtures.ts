import type { Author, Comment, Language, Platform, Template, Theme, Variant } from "@icg/shared";

const creator: Record<Platform, Author> = {
  tiktok: {
    username: "nico.cuts",
    displayName: "Nico",
    avatar: { kind: "pool", id: "a-04" },
    verified: true,
  },
  instagram: {
    username: "nico.cuts",
    displayName: "Nico",
    avatar: { kind: "pool", id: "a-04" },
    verified: true,
  },
  youtube: {
    username: "nicocuts",
    displayName: "Nico Cuts",
    avatar: { kind: "pool", id: "a-04" },
    verified: true,
  },
  x: {
    username: "nicocuts",
    displayName: "Nico Cuts",
    avatar: { kind: "pool", id: "a-04" },
    verified: true,
  },
};

const authors = {
  lena: {
    username: "lena.makes",
    displayName: "Lena",
    avatar: { kind: "pool", id: "a-01" },
    verified: false,
  },
  javi: {
    username: "javi_rm",
    displayName: "Javi R.",
    avatar: { kind: "pool", id: "a-02" },
    verified: false,
  },
  sofia: {
    username: "sofia.films",
    displayName: "Sofía 🎬",
    avatar: { kind: "pool", id: "a-03" },
    verified: true,
  },
  kat: {
    username: "kat.edits",
    displayName: "kat",
    avatar: { kind: "default", letter: "k" },
    verified: false,
  },
  noa: {
    username: "noa.vg",
    displayName: "Noa",
    avatar: { kind: "pool", id: "a-05" },
    verified: false,
  },
  dan: {
    username: "dan.colour",
    displayName: "Dan C",
    avatar: { kind: "default" },
    verified: false,
  },
} satisfies Record<string, Author>;

const EN: Array<Omit<Comment, "id" | "origin" | "reply">> = [
  {
    author: authors.lena,
    text: "the ending??? 😭😭 I was NOT ready",
    likes: 12_400,
    timeAgo: "2h",
    pinned: true,
    likedByCreator: true,
  },
  {
    author: authors.dan,
    text: "ok but the way the colour grade shifts right when the beat drops... I've watched this like 14 times now and I keep finding new details, genuinely the best thing on my feed this week 👏👏",
    likes: 1_240,
    timeAgo: "5h",
    pinned: false,
    likedByCreator: false,
  },
  {
    author: authors.kat,
    text: "POV: you forgot to drink water 💀",
    likes: 892,
    timeAgo: "1d",
    pinned: false,
    likedByCreator: true,
  },
  {
    author: authors.sofia,
    text: "W editor 💯💯 tutorial when 👀",
    likes: 1_300_000,
    timeAgo: "3d",
    pinned: false,
    likedByCreator: false,
  },
  {
    author: authors.noa,
    text: "👨‍💻 as a dev this is exactly how my week went ❤️‍🔥 the transition at 0:07 👍🏽🙌 teach us pls",
    likes: 47,
    timeAgo: "12m",
    pinned: false,
    likedByCreator: false,
  },
];

const ES: Array<Omit<Comment, "id" | "origin" | "reply">> = [
  {
    author: authors.javi,
    text: "no porque este edit está INCREÍBLE 🔥🔥🔥 cómo haces las transiciones???",
    likes: 12_400,
    timeAgo: "2 h",
    pinned: true,
    likedByCreator: true,
  },
  {
    author: authors.sofia,
    text: "me llamo Sofía y apruebo este mensaje 😂😂😂 ¿alguien más a las 3 am viendo esto en vez de dormir? porque yo llevo media hora en bucle",
    likes: 3_480,
    timeAgo: "7 h",
    pinned: false,
    likedByCreator: false,
  },
  {
    author: authors.lena,
    text: "esto me recordó a mi abuela 🥹❤️ gracias por subirlo",
    likes: 215,
    timeAgo: "1 d",
    pinned: false,
    likedByCreator: true,
  },
];

const REPLIES: Record<Language, { text: string; likes: number; timeAgo: string }> = {
  en: {
    text: "part 2 drops Friday 🔥 thank you for watching till the end",
    likes: 2_100,
    timeAgo: "1h",
  },
  es: {
    text: "la parte 2 sale el viernes 🔥 gracias por verlo hasta el final",
    likes: 2_100,
    timeAgo: "1 h",
  },
};

export function sampleComment(platform: Platform, language: Language, index = 0): Comment {
  const bank = language === "es" ? ES : EN;
  const base = bank[index % bank.length]!;
  return {
    id: `sample-${platform}-${language}-${index}`,
    origin: "generated",
    ...base,
    reply: { author: creator[platform], ...REPLIES[language] },
  };
}

export function sampleComments(platform: Platform, language: Language): Comment[] {
  const bank = language === "es" ? ES : EN;
  return bank.map((_, i) => sampleComment(platform, language, i));
}

export const ALL_TEMPLATES: Template[] = (["tiktok", "instagram", "youtube", "x"] as const).flatMap(
  (platform) =>
    (["dark", "light"] as const).flatMap((theme) =>
      (["single", "creator-reply"] as const).map((variant) => ({ platform, theme, variant })),
    ),
);

export const templateName = (t: Template): `${Platform}-${Theme}-${Variant}` =>
  `${t.platform}-${t.theme}-${t.variant}`;
