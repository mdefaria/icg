import { KeyPayload } from "@icg/shared";
import { z } from "zod";
import { privateKeyMaterial, publicKeyMaterial, verifyEd25519, type Ed25519Mode } from "./ed25519";

export const ACTIVATION_TOKEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

export const ActivationToken = z.object({
  key: KeyPayload,
  device: z.string().min(1),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});
export type ActivationToken = z.infer<typeof ActivationToken>;

export type VerifyResult =
  | { ok: true; payload: ActivationToken }
  | { ok: false; reason: "malformed" | "bad-signature" | "invalid-payload" | "expired" };

const ALGORITHM = { name: "Ed25519" };
const HEADER = { alg: "EdDSA", typ: "JWT" };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", privateKeyMaterial(jwk), ALGORITHM, false, ["sign"]);
}

export function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", publicKeyMaterial(jwk), ALGORITHM, true, ["verify"]);
}

export async function sign(data: string, privateKey: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(ALGORITHM, privateKey, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function verify(
  data: string,
  signature: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  const bytes = base64UrlDecode(signature);
  if (!bytes || bytes.length !== 64) return false;
  return crypto.subtle.verify(ALGORITHM, publicKey, bytes, encoder.encode(data));
}

export function canonicalKeyPayload(payload: KeyPayload): string {
  return JSON.stringify({
    v: payload.v,
    id: payload.id,
    issuedAt: payload.issuedAt,
    devices: payload.devices,
  });
}

export function signKeyPayload(payload: KeyPayload, privateKey: CryptoKey): Promise<string> {
  return sign(canonicalKeyPayload(payload), privateKey);
}

export function verifyKeyPayload(
  payload: KeyPayload,
  signature: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  return verify(canonicalKeyPayload(payload), signature, publicKey);
}

export async function signActivationToken(
  payload: ActivationToken,
  privateKey: CryptoKey,
): Promise<string> {
  const signingInput = [
    base64UrlEncode(encoder.encode(JSON.stringify(HEADER))),
    base64UrlEncode(encoder.encode(JSON.stringify(payload))),
  ].join(".");
  return `${signingInput}.${await sign(signingInput, privateKey)}`;
}

export interface VerifyOptions {
  ed25519?: Ed25519Mode;
}

export async function verifyActivationToken(
  token: string,
  publicKeyJwk: JsonWebKey,
  now: number = Math.floor(Date.now() / 1000),
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const headerBytes = base64UrlDecode(headerPart);
  const payloadBytes = base64UrlDecode(payloadPart);
  const signature = base64UrlDecode(signaturePart);
  if (!headerBytes || !payloadBytes || !signature) return { ok: false, reason: "malformed" };

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(decoder.decode(headerBytes));
    payload = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parsedHeader = z.object({ alg: z.literal(HEADER.alg) }).safeParse(header);
  if (!parsedHeader.success) return { ok: false, reason: "malformed" };

  const signed = encoder.encode(`${headerPart}.${payloadPart}`);
  if (
    signature.length !== 64 ||
    !(await verifyEd25519(signed, signature, publicKeyJwk, options.ed25519))
  ) {
    return { ok: false, reason: "bad-signature" };
  }

  const parsed = ActivationToken.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "invalid-payload" };
  if (parsed.data.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload: parsed.data };
}
