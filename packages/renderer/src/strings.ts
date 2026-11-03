import type { Language, Platform } from "@icg/shared";

export type Copy = {
  reply: string;
  pinned: string;
  pinnedBy: (handle: string) => string;
  creator: string;
  likedByCreator: string;
  seeTranslation: string;
  viewReplies: (count: number, formatted: string) => string;
};

const TIKTOK: Record<Language, Copy> = {
  en: {
    reply: "Reply",
    pinned: "Pinned",
    pinnedBy: () => "Pinned",
    creator: "Creator",
    likedByCreator: "Liked by creator",
    seeTranslation: "See translation",
    viewReplies: (n, f) => (n === 1 ? "View 1 reply" : `View ${f} replies`),
  },
  es: {
    reply: "Responder",
    pinned: "Fijado",
    pinnedBy: () => "Fijado",
    creator: "Creador",
    likedByCreator: "Le gusta al creador",
    seeTranslation: "Ver traducción",
    viewReplies: (n, f) => (n === 1 ? "Ver 1 respuesta" : `Ver ${f} respuestas`),
  },
};

const INSTAGRAM: Record<Language, Copy> = {
  en: {
    reply: "Reply",
    pinned: "Pinned",
    pinnedBy: () => "Pinned",
    creator: "Author",
    likedByCreator: "Liked by creator",
    seeTranslation: "See translation",
    viewReplies: (n, f) => (n === 1 ? "View 1 more reply" : `View ${f} more replies`),
  },
  es: {
    reply: "Responder",
    pinned: "Fijado",
    pinnedBy: () => "Fijado",
    creator: "Autor",
    likedByCreator: "Le gusta al creador",
    seeTranslation: "Ver traducción",
    viewReplies: (n, f) => (n === 1 ? "Ver 1 respuesta más" : `Ver ${f} respuestas más`),
  },
};

const YOUTUBE: Record<Language, Copy> = {
  en: {
    reply: "Reply",
    pinned: "Pinned",
    pinnedBy: (h) => `Pinned by ${h}`,
    creator: "Creator",
    likedByCreator: "Liked by creator",
    seeTranslation: "Translate to English",
    viewReplies: (n, f) => (n === 1 ? "1 reply" : `${f} replies`),
  },
  es: {
    reply: "Responder",
    pinned: "Fijado",
    pinnedBy: (h) => `Fijado por ${h}`,
    creator: "Creador",
    likedByCreator: "Le gusta al creador",
    seeTranslation: "Traducir al español",
    viewReplies: (n, f) => (n === 1 ? "1 respuesta" : `${f} respuestas`),
  },
};

const X: Record<Language, Copy> = {
  en: {
    reply: "Reply",
    pinned: "Pinned",
    pinnedBy: () => "Pinned",
    creator: "Creator",
    likedByCreator: "Liked by creator",
    seeTranslation: "Translate post",
    viewReplies: (n, f) => (n === 1 ? "Show 1 reply" : `Show ${f} replies`),
  },
  es: {
    reply: "Responder",
    pinned: "Fijado",
    pinnedBy: () => "Fijado",
    creator: "Creador",
    likedByCreator: "Le gusta al creador",
    seeTranslation: "Traducir post",
    viewReplies: (n, f) => (n === 1 ? "Mostrar 1 respuesta" : `Mostrar ${f} respuestas`),
  },
};

const COPY: Record<Platform, Record<Language, Copy>> = {
  tiktok: TIKTOK,
  instagram: INSTAGRAM,
  youtube: YOUTUBE,
  x: X,
};

export const copyFor = (platform: Platform, language: Language): Copy => COPY[platform][language];
