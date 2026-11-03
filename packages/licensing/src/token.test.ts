import { KEY_VERSION } from "@icg/shared";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACTIVATION_TOKEN_TTL_SECONDS,
  base64UrlDecode,
  base64UrlEncode,
  importPrivateKey,
  importPublicKey,
  signActivationToken,
  signKeyPayload,
  verifyActivationToken,
  verifyKeyPayload,
  type ActivationToken,
} from "./token";
import { verifyWithNoble, type Ed25519Mode } from "./ed25519";

async function keypair() {
  const pair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { privateKey: await importPrivateKey(privateJwk), publicJwk };
}

const now = 1_800_000_000;
const payload: ActivationToken = {
  key: { v: KEY_VERSION, id: "0123456789ABCDEF", issuedAt: now - 60, devices: 3 },
  device: "device-1",
  iat: now,
  exp: now + ACTIVATION_TOKEN_TTL_SECONDS,
};

describe.each<Ed25519Mode>(["auto", "noble"])("activation token (ed25519: %s)", (mode) => {
  const verifyWith = (token: string, jwk: JsonWebKey, at: number) =>
    verifyActivationToken(token, jwk, at, { ed25519: mode });

  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey;
  let token: string;

  beforeAll(async () => {
    ({ privateKey, publicJwk } = await keypair());
    token = await signActivationToken(payload, privateKey);
  });

  it("is a three-part compact JWS that verifies with the public key", async () => {
    expect(token.split(".")).toHaveLength(3);
    expect(await verifyWith(token, publicJwk, now + 1)).toEqual({ ok: true, payload });
  });

  it("ignores a JWK alg member, as Node emits alg Ed25519", async () => {
    expect(await verifyWith(token, { ...publicJwk, alg: "Ed25519" }, now + 1)).toEqual({
      ok: true,
      payload,
    });
  });

  it("fails with a signature of the wrong length or a public key that is not one", async () => {
    const [header, body] = token.split(".") as [string, string, string];
    expect(await verifyWith(`${header}.${body}.AAAA`, publicJwk, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
    expect(await verifyWith(token, { kty: "OKP", crv: "Ed25519" }, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails with a tampered payload", async () => {
    const [header, body, signature] = token.split(".") as [string, string, string];
    const tampered = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)!),
    ) as ActivationToken;
    tampered.device = "device-2";
    const forged = [
      header,
      base64UrlEncode(new TextEncoder().encode(JSON.stringify(tampered))),
      signature,
    ].join(".");
    expect(await verifyWith(forged, publicJwk, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails with another public key", async () => {
    const other = await keypair();
    expect(await verifyWith(token, other.publicJwk, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails when expired or malformed", async () => {
    expect(await verifyWith(token, publicJwk, payload.exp)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await verifyWith("a.b", publicJwk, now)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await verifyWith("not base64!.x.y", publicJwk, now)).toEqual({
      ok: false,
      reason: "malformed",
    });
    const noneAlg = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "none" })));
    const [, body, signature] = token.split(".") as [string, string, string];
    expect(await verifyWith(`${noneAlg}.${body}.${signature}`, publicJwk, now)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a payload that is not an ActivationToken even when signed", async () => {
    const signed = await signActivationToken(
      { ...payload, key: { ...payload.key, v: 2 } } as unknown as ActivationToken,
      privateKey,
    );
    expect(await verifyWith(signed, publicJwk, now)).toEqual({
      ok: false,
      reason: "invalid-payload",
    });
  });
});

describe("key payload signature", () => {
  it("verifies the stored KeyPayload signature and detects tampering", async () => {
    const { privateKey, publicJwk } = await keypair();
    const publicKey = await importPublicKey(publicJwk);
    const signature = await signKeyPayload(payload.key, privateKey);
    expect(await verifyKeyPayload(payload.key, signature, publicKey)).toBe(true);
    expect(await verifyKeyPayload({ ...payload.key, devices: 99 }, signature, publicKey)).toBe(
      false,
    );
    expect(await verifyKeyPayload(payload.key, "AAAA", publicKey)).toBe(false);
  });
});

describe("Ed25519 fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("verifies RFC 8032 test vector 1 with the noble verifier", () => {
    const hex = (text: string) =>
      Uint8Array.from(text.match(/../g)!, (byte) => Number.parseInt(byte, 16));
    const publicKey = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    const signature = hex(
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    );
    const jwk: JsonWebKey = { kty: "OKP", crv: "Ed25519", x: base64UrlEncode(publicKey) };
    expect(verifyWithNoble(new Uint8Array(), signature, jwk)).toBe(true);
    expect(verifyWithNoble(new Uint8Array([1]), signature, jwk)).toBe(false);
  });

  it("falls back to noble when WebCrypto has no Ed25519, once, with the same signature", async () => {
    const { privateKey, publicJwk } = await keypair();
    const token = await signActivationToken(payload, privateKey);

    const importKey = vi
      .spyOn(crypto.subtle, "importKey")
      .mockRejectedValue(new DOMException("Unrecognized algorithm name", "NotSupportedError"));
    const fresh = await import("./token");

    expect(await fresh.verifyActivationToken(token, publicJwk, now + 1)).toEqual({
      ok: true,
      payload,
    });
    const forged = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(await fresh.verifyActivationToken(forged, publicJwk, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
    expect(importKey).toHaveBeenCalledTimes(1);
  });
});
