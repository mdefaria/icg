import { type HostKind } from "@icg/shared";
import { z } from "zod";

export const VersionResponse = z.object({
  latest: z.string().min(1),
  url: z.url(),
  notes: z.string(),
});
export type VersionResponse = z.infer<typeof VersionResponse>;

export interface UpdateCheckOptions {
  apiBaseUrl: string;
  host: HostKind;
  currentVersion: string;
  fetch?: typeof fetch;
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[];
}

function parseVersion(text: string): ParsedVersion | null {
  const match = SEMVER.exec(text.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      if (Number(left) !== Number(right)) return Number(left) < Number(right) ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    const difference = left.core[i]! - right.core[i]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export async function checkForUpdate(options: UpdateCheckOptions): Promise<VersionResponse | null> {
  try {
    const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    const url = `${options.apiBaseUrl.replace(/\/+$/, "")}/version?host=${encodeURIComponent(options.host)}`;
    const response = await doFetch(url);
    if (!response.ok) return null;
    const parsed = VersionResponse.safeParse(await response.json());
    if (!parsed.success) return null;
    const order = compareVersions(parsed.data.latest, options.currentVersion);
    return order !== null && order > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}
