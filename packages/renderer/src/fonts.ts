import { parse, type Font, type Glyph } from "opentype.js/dist/opentype.mjs";

export type FontFamily = "Inter" | "Roboto";
export type FontWeight = 400 | 500 | 600 | 700;

export type FontFace = { family: FontFamily; weight: FontWeight; data: Uint8Array };

class AdvanceTable {
  private readonly glyphs = new Map<number, Glyph>();
  private readonly kerning = new Map<string, number>();
  readonly unitsPerEm: number;

  constructor(private readonly font: Font) {
    this.unitsPerEm = font.unitsPerEm;
  }

  private glyph(cp: number): Glyph {
    let g = this.glyphs.get(cp);
    if (!g) {
      g = this.font.charToGlyph(String.fromCodePoint(cp));
      this.glyphs.set(cp, g);
    }
    return g;
  }

  private kern(left: Glyph, right: Glyph): number {
    const key = `${left.index}:${right.index}`;
    let v = this.kerning.get(key);
    if (v === undefined) {
      try {
        v = this.font.getKerningValue(left, right) || 0;
      } catch {
        v = 0;
      }
      this.kerning.set(key, v);
    }
    return v;
  }

  width(text: string, size: number): number {
    let units = 0;
    let prev: Glyph | undefined;
    for (const ch of text) {
      const g = this.glyph(ch.codePointAt(0)!);
      units += g.advanceWidth ?? 0;
      if (prev) units += this.kern(prev, g);
      prev = g;
    }
    return (units / this.unitsPerEm) * size;
  }
}

export class FontSet {
  private readonly tables = new Map<string, AdvanceTable>();
  private readonly cache = new Map<string, number>();

  constructor(readonly faces: FontFace[]) {
    if (faces.length === 0) throw new Error("FontSet needs at least one face");
  }

  buffers(): Uint8Array[] {
    return this.faces.map((f) => f.data);
  }

  resolve(family: FontFamily, weight: FontWeight): FontFace {
    const sameFamily = this.faces.filter((f) => f.family === family);
    const pool = sameFamily.length > 0 ? sameFamily : this.faces;
    let best = pool[0]!;
    for (const face of pool) {
      if (Math.abs(face.weight - weight) < Math.abs(best.weight - weight)) best = face;
    }
    return best;
  }

  private table(face: FontFace): AdvanceTable {
    const key = `${face.family}-${face.weight}`;
    let table = this.tables.get(key);
    if (!table) {
      const copy = new Uint8Array(face.data).buffer;
      table = new AdvanceTable(parse(copy));
      this.tables.set(key, table);
    }
    return table;
  }

  measure(text: string, family: FontFamily, weight: FontWeight, size: number): number {
    if (text.length === 0) return 0;
    const face = this.resolve(family, weight);
    const key = `${face.family}|${face.weight}|${size}|${text}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const width = this.table(face).width(text, size);
    this.cache.set(key, width);
    return width;
  }
}
