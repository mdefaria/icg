import type { Language, Platform } from "@icg/shared";

export type CountStyle = { platform: Platform; language: Language };

const SUFFIX: Record<
  Language,
  { thousand: string; million: string; decimal: string; group: string }
> = {
  en: { thousand: "K", million: "M", decimal: ".", group: "," },
  es: { thousand: " mil", million: " M", decimal: ",", group: "." },
};

const GROUPS_FULL_BELOW_10K: ReadonlySet<Platform> = new Set(["x", "instagram"]);

function oneDecimal(value: number, decimal: string): string {
  const fixed = Math.floor(value * 10) / 10;
  const text = fixed.toFixed(1);
  return (text.endsWith(".0") ? text.slice(0, -2) : text).replace(".", decimal);
}

function grouped(n: number, group: string): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

export function formatCount(n: number, style: CountStyle): string {
  const { thousand, million, decimal, group } = SUFFIX[style.language];
  if (n < 1000) return n.toString();
  if (n < 10_000) {
    if (style.platform === "tiktok") return n.toString();
    if (GROUPS_FULL_BELOW_10K.has(style.platform)) return grouped(n, group);
    return `${oneDecimal(n / 1000, decimal)}${thousand}`;
  }
  if (n < 1_000_000) return `${oneDecimal(n / 1000, decimal)}${thousand}`;
  return `${oneDecimal(n / 1_000_000, decimal)}${million}`;
}

export function formatLikes(n: number, style: CountStyle): string {
  return formatCount(n, style);
}
