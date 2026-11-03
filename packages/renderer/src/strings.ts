import type { Language } from "@icg/shared";

const STRINGS = {
  reply: { en: "Reply", es: "Responder" },
  pinned: { en: "Pinned", es: "Fijado" },
  pinnedBy: { en: "Pinned by", es: "Fijado por" },
  creator: { en: "Creator", es: "Creador" },
  author: { en: "Author", es: "Autor" },
  likedByCreator: { en: "Liked by creator", es: "Le gustó al creador" },
  seeTranslation: { en: "See translation", es: "Ver traducción" },
  viewReplies: { en: "View replies", es: "Ver respuestas" },
  replies: { en: "replies", es: "respuestas" },
  reply1: { en: "reply", es: "respuesta" },
} as const satisfies Record<string, Record<Language, string>>;

export type StringKey = keyof typeof STRINGS;

export const t = (key: StringKey, locale: Language): string => STRINGS[key][locale];
