import { parse, type Font } from "opentype.js/dist/opentype.mjs";

export type BundledFamily = "Inter" | "Roboto";
export type FontFamily = BundledFamily | (string & {});
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type FontFace = { family: FontFamily; weight: FontWeight; data: Uint8Array };

type Coverage =
  | { format: 1; glyphs: number[] }
  | { format: 2; ranges: Array<{ start: number; end: number; index: number }> };
type ClassDef =
  | { format: 1; startGlyph: number; classes: number[] }
  | { format: 2; ranges: Array<{ start: number; end: number; classId: number }> };
type Value = { xAdvance?: number } | undefined;
type PairSubtable =
  | {
      posFormat: 1;
      coverage: Coverage;
      pairSets: Array<Array<{ secondGlyph: number; value1?: Value; value2?: Value }>>;
    }
  | {
      posFormat: 2;
      coverage: Coverage;
      classDef1: ClassDef;
      classDef2: ClassDef;
      class1Count: number;
      class2Count: number;
      classRecords: Array<Array<{ value1?: Value; value2?: Value }>>;
    };
type LigatureSubtable = {
  substFormat: 1;
  coverage: Coverage;
  ligatureSets: Array<Array<{ ligGlyph: number; components: number[] }>>;
};
type Layout = {
  scripts: Array<{
    tag: string;
    script: {
      defaultLangSys?: { featureIndexes: number[] };
    };
  }>;
  features: Array<{ tag: string; feature: { lookupListIndexes: number[] } }>;
  lookups: Array<{ lookupType: number; subtables: unknown[] }>;
};

const LIGATURE_FEATURES = new Set(["liga", "rlig", "clig"]);
const KERN_FEATURES = new Set(["kern"]);
const IGNORABLE =
  /^(?:\u00AD|\u034F|\u061C|\u115F|\u1160|\u17B4|\u17B5|[\u180B-\u180F]|[\u200B-\u200F]|[\u202A-\u202E]|[\u2060-\u206F]|[\uFE00-\uFE0F]|\uFEFF)$/u;

function coverageIndex(c: Coverage, glyph: number): number {
  if (c.format === 1) return c.glyphs.indexOf(glyph);
  for (const r of c.ranges)
    if (glyph >= r.start && glyph <= r.end) return r.index + glyph - r.start;
  return -1;
}

function classOf(c: ClassDef, glyph: number): number {
  if (c.format === 1) {
    const i = glyph - c.startGlyph;
    return i >= 0 && i < c.classes.length ? (c.classes[i] ?? 0) : 0;
  }
  for (const r of c.ranges) if (glyph >= r.start && glyph <= r.end) return r.classId;
  return 0;
}

function lookupsFor(layout: Layout | undefined, tags: Set<string>): number[] {
  if (!layout) return [];
  const script =
    layout.scripts.find((s) => s.tag === "latn") ?? layout.scripts.find((s) => s.tag === "DFLT");
  const featureIndexes = script?.script.defaultLangSys?.featureIndexes ?? [];
  const out = new Set<number>();
  for (const fi of featureIndexes) {
    const f = layout.features[fi];
    if (f && tags.has(f.tag)) for (const l of f.feature.lookupListIndexes) out.add(l);
  }
  return [...out].sort((a, b) => a - b);
}

class Shaper {
  readonly unitsPerEm: number;
  private readonly ligatures: LigatureSubtable[][];
  private readonly kerning: PairSubtable[][];
  private readonly advances = new Map<number, number>();
  private readonly glyphIds = new Map<number, number>();

  constructor(private readonly font: Font) {
    this.unitsPerEm = font.unitsPerEm;
    const tables = font.tables as { gsub?: Layout; gpos?: Layout };
    this.ligatures = lookupsFor(tables.gsub, LIGATURE_FEATURES)
      .map((i) => tables.gsub!.lookups[i]!)
      .filter((l) => l.lookupType === 4)
      .map((l) => l.subtables as LigatureSubtable[]);
    this.kerning = lookupsFor(tables.gpos, KERN_FEATURES)
      .map((i) => tables.gpos!.lookups[i]!)
      .filter((l) => l.lookupType === 2)
      .map((l) => l.subtables as PairSubtable[]);
  }

  glyph(cp: number): number {
    let id = this.glyphIds.get(cp);
    if (id === undefined) {
      id = this.font.charToGlyphIndex(String.fromCodePoint(cp)) ?? 0;
      this.glyphIds.set(cp, id);
    }
    return id;
  }

  has(cp: number): boolean {
    return this.glyph(cp) !== 0;
  }

  private advance(glyph: number): number {
    let a = this.advances.get(glyph);
    if (a === undefined) {
      a = this.font.glyphs.get(glyph).advanceWidth ?? 0;
      this.advances.set(glyph, a);
    }
    return a;
  }

  private ligate(glyphs: number[]): number[] {
    let current = glyphs;
    for (const subtables of this.ligatures) {
      const out: number[] = [];
      let i = 0;
      while (i < current.length) {
        const g = current[i]!;
        let matched = false;
        for (const st of subtables) {
          const ci = coverageIndex(st.coverage, g);
          if (ci < 0) continue;
          for (const lig of st.ligatureSets[ci] ?? []) {
            if (lig.components.every((c, k) => current[i + 1 + k] === c)) {
              out.push(lig.ligGlyph);
              i += 1 + lig.components.length;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched) {
          out.push(g);
          i++;
        }
      }
      current = out;
    }
    return current;
  }

  private pairAdjust(subtables: PairSubtable[], left: number, right: number): number | undefined {
    for (const st of subtables) {
      const ci = coverageIndex(st.coverage, left);
      if (ci < 0) continue;
      if (st.posFormat === 1) {
        const pair = st.pairSets[ci]?.find((p) => p.secondGlyph === right);
        if (pair) return (pair.value1?.xAdvance ?? 0) + (pair.value2?.xAdvance ?? 0);
        continue;
      }
      const c1 = classOf(st.classDef1, left);
      const c2 = classOf(st.classDef2, right);
      if (c1 >= st.class1Count || c2 >= st.class2Count) continue;
      const rec = st.classRecords[c1]?.[c2];
      return (rec?.value1?.xAdvance ?? 0) + (rec?.value2?.xAdvance ?? 0);
    }
    return undefined;
  }

  widthUnits(codepoints: number[]): number {
    const glyphs = this.ligate(codepoints.map((cp) => this.glyph(cp)));
    let units = 0;
    for (const g of glyphs) units += this.advance(g);
    for (const subtables of this.kerning) {
      for (let i = 0; i + 1 < glyphs.length; i++) {
        const v = this.pairAdjust(subtables, glyphs[i]!, glyphs[i + 1]!);
        if (v) units += v;
      }
    }
    return units;
  }
}

export function matchWeight(available: readonly number[], desired: number): number {
  if (available.includes(desired)) return desired;
  const below = available.filter((w) => w < desired).sort((a, b) => b - a);
  const above = available.filter((w) => w > desired).sort((a, b) => a - b);
  if (desired >= 400 && desired <= 500) {
    const upTo500 = above.filter((w) => w <= 500);
    const rest = above.filter((w) => w > 500);
    return upTo500[0] ?? below[0] ?? rest[0]!;
  }
  if (desired < 400) return below[0] ?? above[0]!;
  return above[0] ?? below[0]!;
}

const MAX_CACHE = 50_000;

export class FontSet {
  private readonly shapers = new Map<FontFace, Shaper | null>();
  private readonly cache = new Map<string, number>();
  private readonly families: FontFamily[] = [];

  constructor(readonly faces: FontFace[]) {
    if (faces.length === 0) throw new Error("FontSet needs at least one face");
    for (const f of faces) if (!this.families.includes(f.family)) this.families.push(f.family);
  }

  buffers(): Uint8Array[] {
    return this.faces.map((f) => f.data);
  }

  resolve(family: FontFamily, weight: number): FontFace {
    const sameFamily = this.faces.filter((f) => f.family === family);
    const pool = sameFamily.length > 0 ? sameFamily : this.faces;
    const w = matchWeight(
      pool.map((f) => f.weight),
      weight,
    );
    return pool.find((f) => f.weight === w)!;
  }

  private shaper(face: FontFace): Shaper | null {
    let s = this.shapers.get(face);
    if (s === undefined) {
      try {
        s = new Shaper(parse(new Uint8Array(face.data).buffer));
      } catch {
        s = null;
      }
      this.shapers.set(face, s);
    }
    return s;
  }

  private faceFor(cp: number, primary: FontFace, weight: number): FontFace | undefined {
    if (this.shaper(primary)?.has(cp)) return primary;
    for (const family of this.families) {
      if (family === primary.family) continue;
      const face = this.resolve(family, weight);
      if (this.shaper(face)?.has(cp)) return face;
    }
    return undefined;
  }

  unsupported(text: string): string[] {
    const out = new Set<string>();
    const primary = this.faces[0]!;
    for (const ch of text) {
      if (/\s/u.test(ch) || IGNORABLE.test(ch)) continue;
      if (!this.faceFor(ch.codePointAt(0)!, primary, 400)) out.add(ch);
    }
    return [...out];
  }

  measure(text: string, family: FontFamily, weight: number, size: number): number {
    if (text.length === 0) return 0;
    const primary = this.resolve(family, weight);
    const key = `${primary.family}|${primary.weight}|${text}`;
    let em = this.cache.get(key);
    if (em === undefined) {
      em = 0;
      let run: number[] = [];
      let runFace = primary;
      const flush = () => {
        if (run.length === 0) return;
        const s = this.shaper(runFace);
        if (s) em! += s.widthUnits(run) / s.unitsPerEm;
        run = [];
      };
      for (const ch of text) {
        if (IGNORABLE.test(ch)) continue;
        const cp = ch.codePointAt(0)!;
        const face = this.faceFor(cp, primary, weight) ?? primary;
        if (face !== runFace) {
          flush();
          runFace = face;
        }
        run.push(cp);
      }
      flush();
      if (this.cache.size > MAX_CACHE) this.cache.clear();
      this.cache.set(key, em);
    }
    return em * size;
  }
}
