import type { Language, Platform } from "@icg/shared";
import type { Rng } from "./engine";

const MINUTE = 1;
const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const MAX_AGE: Record<Platform, number> = {
  tiktok: 4 * WEEK + 6 * DAY,
  instagram: 30 * WEEK,
  youtube: 2 * YEAR,
  x: DAY - 1,
};

type Unit = "s" | "m" | "h" | "d" | "w" | "mo" | "y";

const UNIT_MINUTES: Record<Unit, number> = {
  s: 1 / 60,
  m: MINUTE,
  h: HOUR,
  d: DAY,
  w: WEEK,
  mo: MONTH,
  y: YEAR,
};

const ES_UNITS: Record<Unit, [string, string]> = {
  s: ["s", "s"],
  m: ["min", "min"],
  h: ["h", "h"],
  d: ["d", "d"],
  w: ["sem", "sem"],
  mo: ["mes", "meses"],
  y: ["año", "años"],
};

export function sampleAge(rng: Rng, platform: Platform, maxMinutes = MAX_AGE[platform]): number {
  const min = platform === "x" ? 0.5 : 1;
  const max = Math.max(min, Math.min(maxMinutes, MAX_AGE[platform]));
  return Math.exp(Math.log(min) + rng() * (Math.log(max) - Math.log(min)));
}

function unitFor(minutes: number, platform: Platform): Unit {
  if (minutes < 1) return "s";
  if (minutes < HOUR) return "m";
  if (minutes < DAY) return "h";
  if (minutes < WEEK) return "d";
  if (platform !== "youtube" || minutes < MONTH) return "w";
  if (minutes < YEAR) return "mo";
  return "y";
}

export function formatAge(minutes: number, platform: Platform, language: Language): string {
  const unit = unitFor(minutes, platform);
  const n = Math.max(1, Math.floor(minutes / UNIT_MINUTES[unit]));
  if (language === "en") return `${n}${unit}`;
  const [one, many] = ES_UNITS[unit];
  return `${n} ${n === 1 ? one : many}`;
}

const PARSE = /^(\d+)\s?(s|m|min|h|d|w|sem|mo|mes|meses|y|año|años)$/;

const PARSED_UNIT: Record<string, Unit> = {
  s: "s",
  m: "m",
  min: "m",
  h: "h",
  d: "d",
  w: "w",
  sem: "w",
  mo: "mo",
  mes: "mo",
  meses: "mo",
  y: "y",
  año: "y",
  años: "y",
};

export function parseAge(timeAgo: string): number | undefined {
  const match = PARSE.exec(timeAgo.trim());
  if (!match) return undefined;
  const unit = PARSED_UNIT[match[2] ?? ""];
  return unit ? Number(match[1]) * UNIT_MINUTES[unit] : undefined;
}
