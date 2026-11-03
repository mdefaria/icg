import { KEY_VERSION } from "@icg/shared";

export const KEY_PREFIX = `ICG${KEY_VERSION}`;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_BYTES = 10;
const ID_CHARS = 16;
const CHECK_CHARS = 4;
const GROUP = 5;

export function encodeBase32(bytes: Uint8Array, chars: number): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
    if (out.length === chars) break;
  }
  return out;
}

export function decodeBase32(text: string, byteLength: number): Uint8Array | null {
  const out = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      if (index >= byteLength) return null;
      out[index++] = (buffer >>> (bits - 8)) & 255;
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  return index === byteLength ? out : null;
}

async function checksum(idBytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", idBytes));
  return encodeBase32(digest, CHECK_CHARS);
}

export async function formatKey(id: string): Promise<string> {
  const idBytes = decodeBase32(id, ID_BYTES);
  if (!idBytes || id.length !== ID_CHARS) throw new Error("not a key id");
  const body = id + (await checksum(idBytes));
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP) groups.push(body.slice(i, i + GROUP));
  return [KEY_PREFIX, ...groups].join("-");
}

export async function generateKey(): Promise<{ id: string; key: string }> {
  const idBytes = crypto.getRandomValues(new Uint8Array(ID_BYTES));
  const id = encodeBase32(idBytes, ID_CHARS);
  return { id, key: await formatKey(id) };
}

export async function parseKey(input: string): Promise<string | null> {
  const compact = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!compact.startsWith(KEY_PREFIX)) return null;
  const body = compact.slice(KEY_PREFIX.length).replace(/O/g, "0").replace(/[IL]/g, "1");
  if (body.length !== ID_CHARS + CHECK_CHARS) return null;
  const id = body.slice(0, ID_CHARS);
  const idBytes = decodeBase32(id, ID_BYTES);
  if (!idBytes) return null;
  if ((await checksum(idBytes)) !== body.slice(ID_CHARS)) return null;
  return id;
}
