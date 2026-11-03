import { describe, expect, it } from "vitest";
import { decodeBase32, encodeBase32, formatKey, generateKey, parseKey } from "./key";

const KEY_SHAPE = /^ICG1(-[0-9A-HJKMNP-TV-Z]{5}){4}$/;

describe("Key format", () => {
  it("generates a typeable Key with a version prefix and four groups", async () => {
    const { id, key } = await generateKey();
    expect(id).toHaveLength(16);
    expect(key).toMatch(KEY_SHAPE);
    expect(await formatKey(id)).toBe(key);
  });

  it("parses back to the id, ignoring case, separators and Crockford look-alikes", async () => {
    const { id, key } = await generateKey();
    expect(await parseKey(key)).toBe(id);
    expect(await parseKey(key.toLowerCase())).toBe(id);
    expect(await parseKey(key.replace(/-/g, " "))).toBe(id);
    const confused = key.slice(5).replace(/0/g, "O").replace(/1/g, "I");
    expect(await parseKey(`ICG1-${confused}`)).toBe(id);
  });

  it("rejects a typo, a wrong prefix and a wrong length", async () => {
    const { key } = await generateKey();
    const last = key.at(-1);
    const typo = key.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(await parseKey(typo)).toBeNull();
    expect(await parseKey(key.replace("ICG1", "ICG2"))).toBeNull();
    expect(await parseKey(key.slice(0, -6))).toBeNull();
    expect(await parseKey("")).toBeNull();
  });

  it("round-trips Crockford base32", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const text = encodeBase32(bytes, 16);
    expect(text).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(decodeBase32(text, 10)).toEqual(bytes);
    expect(decodeBase32("U".repeat(16), 10)).toBeNull();
  });
});
