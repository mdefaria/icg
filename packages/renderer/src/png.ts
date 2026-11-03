export type Patch = { x: number; y: number; width: number; height: number; rgba: Uint8Array };

type Deflate = (data: Uint8Array) => Promise<Uint8Array>;

let deflater: Promise<Deflate | undefined> | undefined;

async function nodeDeflate(): Promise<Deflate | undefined> {
  const versions = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions;
  if (!versions?.node) return undefined;
  try {
    const specifier = "node:zlib";
    const zlib = (await import(/* @vite-ignore */ specifier)) as {
      deflateSync(data: Uint8Array, options: { level: number }): Uint8Array;
    };
    return async (data) => zlib.deflateSync(data, { level: 6 });
  } catch {
    return undefined;
  }
}

function streamDeflate(): Deflate | undefined {
  if (typeof CompressionStream === "undefined") return undefined;
  return async (data) => {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
}

export function frameEncoderAvailable(): Promise<boolean> {
  deflater ??= nodeDeflate().then((d) => d ?? streamDeflate());
  return deflater.then((d) => d !== undefined);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

export async function encodeFramePng(
  width: number,
  height: number,
  patch: Patch | undefined,
): Promise<Uint8Array> {
  if (!(await frameEncoderAvailable())) throw new Error("no deflate implementation available");
  const deflate = (await deflater)!;
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  if (patch) {
    const rowBytes = patch.width * 4;
    for (let py = 0; py < patch.height; py++) {
      const src = py * rowBytes;
      const rowStart = (patch.y + py) * stride;
      raw[rowStart] = 1;
      const dst = rowStart + 1 + patch.x * 4;
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (let i = 0; i < rowBytes; i += 4) {
        let r = patch.rgba[src + i]!;
        let g = patch.rgba[src + i + 1]!;
        let b = patch.rgba[src + i + 2]!;
        const a = patch.rgba[src + i + 3]!;
        if (a === 0) {
          r = g = b = 0;
        } else if (a !== 255) {
          const half = a >> 1;
          r = Math.min(255, ((r * 255 + half) / a) | 0);
          g = Math.min(255, ((g * 255 + half) / a) | 0);
          b = Math.min(255, ((b * 255 + half) / a) | 0);
        }
        raw[dst + i] = (r - pr) & 0xff;
        raw[dst + i + 1] = (g - pg) & 0xff;
        raw[dst + i + 2] = (b - pb) & 0xff;
        raw[dst + i + 3] = (a - pa) & 0xff;
        pr = r;
        pg = g;
        pb = b;
        pa = a;
      }
      if (patch.x + patch.width < width) {
        const after = dst + rowBytes;
        raw[after] = (0 - pr) & 0xff;
        raw[after + 1] = (0 - pg) & 0xff;
        raw[after + 2] = (0 - pb) & 0xff;
        raw[after + 3] = (0 - pa) & 0xff;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = await deflate(raw);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
