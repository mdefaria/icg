import type { Language, Platform } from "@icg/shared";

export type CountStyle = { platform: Platform; language: Language };

type Symbols = {
  thousand: string;
  million: string;
  billion: string;
  decimal: string;
  group: string;
};

const SYMBOLS: Record<Language, Symbols> = {
  en: { thousand: "K", million: "M", billion: "B", decimal: ".", group: "," },
  es: { thousand: " mil", million: " M", billion: " mil M", decimal: ",", group: "." },
};

type Rule = {
  belowTenThousand: "plain" | "grouped" | "compact";
  compact: "one-decimal" | "youtube";
};

const RULES: Record<Platform, Rule> = {
  tiktok: { belowTenThousand: "plain", compact: "one-decimal" },
  instagram: { belowTenThousand: "grouped", compact: "one-decimal" },
  x: { belowTenThousand: "grouped", compact: "one-decimal" },
  youtube: { belowTenThousand: "compact", compact: "youtube" },
};

function floorTo(value: number, decimals: number): number {
  const k = 10 ** decimals;
  return Math.floor(value * k + 1e-9) / k;
}

function decimalText(value: number, decimals: number, decimal: string): string {
  const text = floorTo(value, decimals).toFixed(decimals);
  const trimmed = decimals > 0 ? text.replace(/\.?0+$/, "") : text;
  return trimmed.replace(".", decimal);
}

function grouped(n: number, group: string): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

function compact(n: number, rule: Rule, s: Symbols): string {
  const [value, suffix] =
    n >= 1e9 ? [n / 1e9, s.billion] : n >= 1e6 ? [n / 1e6, s.million] : [n / 1e3, s.thousand];
  const decimals = rule.compact === "youtube" && value >= 10 ? 0 : 1;
  return `${decimalText(value, decimals, s.decimal)}${suffix}`;
}

export function formatCount(n: number, style: CountStyle): string {
  const s = SYMBOLS[style.language];
  const rule = RULES[style.platform];
  const value = Math.max(0, Math.floor(n));
  if (value < 1000) return value.toString();
  if (value < 10_000) {
    if (rule.belowTenThousand === "plain") return value.toString();
    if (rule.belowTenThousand === "grouped") return grouped(value, s.group);
  }
  return compact(value, rule, s);
}
