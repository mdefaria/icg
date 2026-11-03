// Downloads the complete Noto and Twemoji SVG sets into assets/emoji/{noto,twemoji} (gitignored).
//
//   pnpm --filter @icg/renderer fetch-emoji [--out <dir>] [--set noto|twemoji] [--registry <url>]
//
// Both sets come from pinned npm tarballs whose sha512 integrity is checked against the registry,
// so the script works anywhere `pnpm install` works. Noto: `nomoji` repackages
// googlefonts/noto-emoji `svg/` plus the waved region flags under Apache-2.0. Twemoji: Discord's
// maintained fork; code MIT, graphics CC-BY 4.0 (the app's credits must attribute it).
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { SVG_ROOT } from "../src/emoji";
import { PACKAGE_PATHS } from "../src/node-assets";

type SetSpec = {
  name: "noto" | "twemoji";
  pkg: string;
  version: string;
  svgDir: string;
  rename: (file: string) => string;
  licences: Record<string, (files: Map<string, Uint8Array>) => string>;
};

const NOTO_NOTICE = `Noto Emoji SVG artwork (https://github.com/googlefonts/noto-emoji), Copyright Google Inc.
Flags from region-flags (https://github.com/behdad/region-flags), public domain.
Licensed under the Apache License, Version 2.0; the full text is in LICENSE.
Downloaded by packages/renderer/scripts/fetch-emoji.ts from npm package nomoji@18.0.0.
`;

const TWEMOJI_GRAPHICS = `Twemoji graphics (https://github.com/discord/twemoji, forked from https://github.com/twitter/twemoji)
Copyright 2014-2021 Twitter, Inc and other contributors; 2022-present Discord.
Graphics licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/
Attribution is required: the application's credits must name Twemoji and link the licence.
Downloaded by packages/renderer/scripts/fetch-emoji.ts from npm package @discordapp/twemoji@16.0.1.
`;

const decode = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : "");

const SETS: SetSpec[] = [
  {
    name: "noto",
    pkg: "nomoji",
    version: "18.0.0",
    svgDir: "package/dist/svg/",
    rename: (file) =>
      `emoji_u${file
        .replace(/\.svg$/, "")
        .split("_")
        .filter((cp) => cp !== "fe0f")
        .map((cp) => cp.padStart(4, "0"))
        .join("_")}.svg`,
    licences: {
      LICENSE: (files) => decode(files.get("package/LICENSE")),
      NOTICE: () => NOTO_NOTICE,
    },
  },
  {
    name: "twemoji",
    pkg: "@discordapp/twemoji",
    version: "16.0.1",
    svgDir: "package/dist/svg/",
    rename: (file) => file,
    licences: {
      LICENSE: (files) => decode(files.get("package/LICENSE")),
      "LICENSE-GRAPHICS": () => TWEMOJI_GRAPHICS,
    },
  },
];

const Packument = z.object({
  dist: z.object({ tarball: z.url(), integrity: z.string().startsWith("sha512-") }),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function untar(tar: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const text = (from: number, len: number) =>
    decode(tar.subarray(from, from + len)).replace(/\0.*$/s, "");
  let offset = 0;
  let longName: string | undefined;
  while (offset + 512 <= tar.length) {
    const name = text(offset, 100);
    if (!name) break;
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(tar[offset + 156] ?? 0);
    const prefix = text(offset + 345, 155);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    if (type === "L") longName = decode(body).replace(/\0.*$/s, "");
    else if (type === "x") {
      const path = /\d+ path=([^\n]*)\n/.exec(decode(body));
      if (path) longName = path[1];
    } else {
      if (type === "0" || type === "\0") {
        files.set(longName ?? (prefix ? `${prefix}/${name}` : name), body);
      }
      longName = undefined;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function fetchSet(spec: SetSpec, registry: string, outDir: string) {
  const metaUrl = `${registry}/${spec.pkg.replace("/", "%2f")}/${spec.version}`;
  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) throw new Error(`${metaUrl}: ${metaRes.status}`);
  const { dist } = Packument.parse(await metaRes.json());
  const tgzRes = await fetch(dist.tarball);
  if (!tgzRes.ok) throw new Error(`${dist.tarball}: ${tgzRes.status}`);
  const tgz = new Uint8Array(await tgzRes.arrayBuffer());
  const digest = `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
  if (digest !== dist.integrity) throw new Error(`${spec.pkg}: integrity mismatch`);

  const files = untar(gunzipSync(tgz));
  const dir = join(outDir, spec.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let count = 0;
  let raw = 0;
  let gzipped = 0;
  let rejected = 0;
  for (const [path, body] of files) {
    if (!path.startsWith(spec.svgDir) || !path.endsWith(".svg")) continue;
    const file = path.slice(spec.svgDir.length);
    if (file.includes("/") || !/^[0-9a-f_-]+\.svg$/.test(file) || !SVG_ROOT.test(decode(body))) {
      rejected++;
      continue;
    }
    writeFileSync(join(dir, spec.rename(file)), body);
    count++;
    raw += body.length;
    gzipped += gzipSync(body, { level: 9 }).length;
  }
  for (const [name, make] of Object.entries(spec.licences)) {
    const content = make(files);
    if (!content) throw new Error(`${spec.pkg}: licence file ${name} missing from the tarball`);
    writeFileSync(join(dir, name), content);
  }
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)} MB`;
  console.log(
    `${spec.name.padEnd(8)} ${spec.pkg}@${spec.version}: ${count} SVGs, ${mb(raw)} raw, ${mb(gzipped)} gzipped per file, tarball ${mb(tgz.length)}${rejected ? `, ${rejected} skipped` : ""}`,
  );
}

const outDir = resolve(arg("out") ?? PACKAGE_PATHS.fullEmoji);
const only = arg("set");
const registry = (arg("registry") ?? "https://registry.npmjs.org").replace(/\/$/, "");
for (const spec of SETS) {
  if (only && only !== spec.name) continue;
  await fetchSet(spec, registry, outDir);
}
console.log(`wrote ${outDir}`);
