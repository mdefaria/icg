import { segmentEmoji } from "./emoji";

export type Measure = (text: string) => number;

export type Token =
  | { kind: "word"; text: string }
  | { kind: "space"; text: string }
  | { kind: "emoji"; cluster: string; codepoints: number[] }
  | { kind: "newline" };

export type LineRun =
  | { kind: "text"; text: string; x: number; width: number }
  | { kind: "emoji"; cluster: string; codepoints: number[]; x: number; width: number };

export type Line = { runs: LineRun[]; width: number };

export type WrapOptions = {
  maxWidth: number;
  measure: Measure;
  emojiWidth: number;
  maxLines?: number;
  ellipsis?: string;
};

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const seg of segmentEmoji(text)) {
    if (seg.kind === "emoji") {
      tokens.push(seg);
      continue;
    }
    for (const part of seg.text.split(/(\n|[ \t]+)/)) {
      if (part === "") continue;
      if (part === "\n") tokens.push({ kind: "newline" });
      else if (/^[ \t]+$/.test(part)) tokens.push({ kind: "space", text: part });
      else tokens.push({ kind: "word", text: part });
    }
  }
  return tokens;
}

type Piece =
  | { kind: "text"; text: string; space: boolean }
  | { kind: "emoji"; cluster: string; codepoints: number[] };

class LineBuilder {
  pieces: Piece[] = [];

  constructor(private readonly opts: WrapOptions) {}

  widthOf(pieces: Piece[]): number {
    let width = 0;
    let buffer = "";
    for (const p of pieces) {
      if (p.kind === "text") buffer += p.text;
      else {
        width += this.opts.measure(buffer) + this.opts.emojiWidth;
        buffer = "";
      }
    }
    return width + this.opts.measure(buffer);
  }

  fits(candidate: Piece): boolean {
    return this.widthOf([...this.trimmed([...this.pieces, candidate])]) <= this.opts.maxWidth;
  }

  trimmed(pieces: Piece[]): Piece[] {
    let end = pieces.length;
    while (end > 0) {
      const last = pieces[end - 1]!;
      if (last.kind === "text" && last.space) end--;
      else break;
    }
    return pieces.slice(0, end);
  }

  get isEmpty(): boolean {
    return this.trimmed(this.pieces).length === 0;
  }

  push(piece: Piece): void {
    this.pieces.push(piece);
  }

  flush(): Line {
    const pieces = this.trimmed(this.pieces);
    this.pieces = [];
    return layout(pieces, this.opts);
  }
}

function layout(pieces: Piece[], opts: WrapOptions): Line {
  const runs: LineRun[] = [];
  let x = 0;
  let buffer = "";
  const flushText = () => {
    if (!buffer) return;
    const width = opts.measure(buffer);
    runs.push({ kind: "text", text: buffer, x, width });
    x += width;
    buffer = "";
  };
  for (const p of pieces) {
    if (p.kind === "text") buffer += p.text;
    else {
      flushText();
      runs.push({
        kind: "emoji",
        cluster: p.cluster,
        codepoints: p.codepoints,
        x,
        width: opts.emojiWidth,
      });
      x += opts.emojiWidth;
    }
  }
  flushText();
  return { runs, width: x };
}

function splitLongWord(word: string, opts: WrapOptions): string[] {
  const chars = Array.from(word);
  const parts: string[] = [];
  let current = "";
  for (const ch of chars) {
    if (current && opts.measure(current + ch) > opts.maxWidth) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapText(text: string, opts: WrapOptions): Line[] {
  const lines: Line[] = [];
  const builder = new LineBuilder(opts);
  const maxLines = opts.maxLines ?? Infinity;

  const emit = () => {
    lines.push(builder.flush());
  };

  let overflow = false;
  for (const token of tokenize(text)) {
    if (lines.length >= maxLines) {
      overflow = token.kind !== "space";
      break;
    }
    if (token.kind === "newline") {
      emit();
      continue;
    }
    if (token.kind === "space") {
      if (!builder.isEmpty) builder.push({ kind: "text", text: " ", space: true });
      continue;
    }
    const piece: Piece =
      token.kind === "emoji"
        ? { kind: "emoji", cluster: token.cluster, codepoints: token.codepoints }
        : { kind: "text", text: token.text, space: false };
    if (builder.fits(piece)) {
      builder.push(piece);
      continue;
    }
    if (!builder.isEmpty) emit();
    if (lines.length >= maxLines) {
      overflow = true;
      break;
    }
    if (piece.kind === "emoji" || opts.measure(piece.text) <= opts.maxWidth) {
      builder.push(piece);
      continue;
    }
    const parts = splitLongWord(piece.text, opts);
    for (let i = 0; i < parts.length; i++) {
      builder.push({ kind: "text", text: parts[i]!, space: false });
      if (i < parts.length - 1) emit();
    }
  }
  if (!overflow && (!builder.isEmpty || lines.length === 0)) lines.push(builder.flush());

  if (overflow || lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const ellipsis = opts.ellipsis ?? "…";
    const last = kept[kept.length - 1]!;
    kept[kept.length - 1] = truncateLine(last, ellipsis, opts);
    return kept;
  }
  return lines;
}

function truncateLine(line: Line, ellipsis: string, opts: WrapOptions): Line {
  const pieces: Piece[] = [];
  for (const run of line.runs) {
    if (run.kind === "text") pieces.push({ kind: "text", text: run.text, space: false });
    else pieces.push({ kind: "emoji", cluster: run.cluster, codepoints: run.codepoints });
  }
  const builder = new LineBuilder(opts);
  const tail: Piece = { kind: "text", text: ellipsis, space: false };
  for (const p of pieces) {
    if (p.kind === "text") {
      for (const ch of Array.from(p.text)) {
        const next: Piece = { kind: "text", text: ch, space: false };
        if (builder.widthOf([...builder.pieces, next, tail]) > opts.maxWidth)
          return finish(builder, tail, opts);
        builder.push(next);
      }
    } else {
      if (builder.widthOf([...builder.pieces, p, tail]) > opts.maxWidth)
        return finish(builder, tail, opts);
      builder.push(p);
    }
  }
  return finish(builder, tail, opts);
}

function finish(builder: LineBuilder, tail: Piece, opts: WrapOptions): Line {
  const pieces = builder.trimmed(builder.pieces);
  return layout([...pieces, tail], opts);
}

export const lineText = (line: Line): string =>
  line.runs.map((r) => (r.kind === "text" ? r.text : r.cluster)).join("");
