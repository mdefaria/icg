import { KEY_VERSION } from "@icg/shared";
import { beforeAll, describe, expect, it } from "vitest";
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

describe("activation token", () => {
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey;
  let token: string;

  beforeAll(async () => {
    ({ privateKey, publicJwk } = await keypair());
    token = await signActivationToken(payload, privateKey);
  });

  it("is a three-part compact JWS that verifies with the public key", async () => {
    expect(token.split(".")).toHaveLength(3);
    const result = await verifyActivationToken(token, publicJwk, now + 1);
    expect(result).toEqual({ ok: true, payload });
    expect(await verifyActivationToken(token, await importPublicKey(publicJwk), now + 1)).toEqual({
      ok: true,
      payload,
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
    expect(await verifyActivationToken(forged, publicJwk, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails with another public key", async () => {
    const other = await keypair();
    expect(await verifyActivationToken(token, other.publicJwk, now + 1)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails when expired or malformed", async () => {
    expect(await verifyActivationToken(token, publicJwk, payload.exp)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await verifyActivationToken("a.b", publicJwk, now)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await verifyActivationToken("not base64!.x.y", publicJwk, now)).toEqual({
      ok: false,
      reason: "malformed",
    });
    const noneAlg = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "none" })));
    const [, body, signature] = token.split(".") as [string, string, string];
    expect(await verifyActivationToken(`${noneAlg}.${body}.${signature}`, publicJwk, now)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a payload that is not an ActivationToken even when signed", async () => {
    const signed = await signActivationToken(
      { ...payload, key: { ...payload.key, v: 2 } } as unknown as ActivationToken,
      privateKey,
    );
    expect(await verifyActivationToken(signed, publicJwk, now)).toEqual({
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
