import * as noble from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

noble.etc.sha512Sync = (...messages) => sha512(noble.etc.concatBytes(...messages));

export type Ed25519Mode = "auto" | "noble";

// Runtimes disagree on the JWK "alg" for Ed25519 (Node exports "Ed25519", workerd only accepts
// "EdDSA" or none), so only the key material crosses the boundary.
export function publicKeyMaterial(jwk: JsonWebKey): JsonWebKey {
  const material: JsonWebKey = { kty: "OKP", crv: "Ed25519" };
  if (jwk.x !== undefined) material.x = jwk.x;
  return material;
}

export function privateKeyMaterial(jwk: JsonWebKey): JsonWebKey {
  const material = publicKeyMaterial(jwk);
  if (jwk.d !== undefined) material.d = jwk.d;
  return material;
}

function rawPublicKey(jwk: JsonWebKey): Uint8Array | null {
  if (typeof jwk.x !== "string" || !/^[A-Za-z0-9_-]+$/.test(jwk.x)) return null;
  const padded = jwk.x
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(jwk.x.length / 4) * 4, "=");
  try {
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export function verifyWithNoble(data: Uint8Array, signature: Uint8Array, jwk: JsonWebKey): boolean {
  const publicKey = rawPublicKey(jwk);
  if (!publicKey) return false;
  try {
    return noble.verify(signature, data, publicKey);
  } catch {
    return false;
  }
}

async function verifyWithWebCrypto(
  data: Uint8Array,
  signature: Uint8Array,
  jwk: JsonWebKey,
): Promise<boolean> {
  const key = await crypto.subtle.importKey("jwk", publicKeyMaterial(jwk), "Ed25519", false, [
    "verify",
  ]);
  return crypto.subtle.verify("Ed25519", key, signature as BufferSource, data as BufferSource);
}

function webCryptoLacksEd25519(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "NotSupportedError" || name === "TypeError";
}

let webCryptoUnavailable = false;

export async function verifyEd25519(
  data: Uint8Array,
  signature: Uint8Array,
  jwk: JsonWebKey,
  mode: Ed25519Mode = "auto",
): Promise<boolean> {
  if (mode === "auto" && !webCryptoUnavailable) {
    try {
      return await verifyWithWebCrypto(data, signature, jwk);
    } catch (error) {
      if (!webCryptoLacksEd25519(error)) return false;
      webCryptoUnavailable = true;
    }
  }
  return verifyWithNoble(data, signature, jwk);
}
