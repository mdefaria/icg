import { ActivationRequest, KEY_VERSION, type ActivationResult } from "@icg/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ActivationNetworkError,
  ActivationTokenError,
  DEVICE_ID_STORAGE_NAME,
  TOKEN_STORAGE_NAME,
  createActivationClient,
  randomUuid,
  type LicenseStorage,
} from "./client";
import { generateKey } from "./key";
import { importPrivateKey, signActivationToken, type ActivationToken } from "./token";

const API = "https://api.icg.test";
const KEY_ID = "0123456789ABCDEF";

function memoryStorage(): LicenseStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => void data.set(name, value),
    removeItem: (name) => void data.delete(name),
  };
}

async function keypair() {
  const pair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateKey: await importPrivateKey(await crypto.subtle.exportKey("jwk", pair.privateKey)),
  };
}

let privateKey: CryptoKey;
let publicKeyJwk: JsonWebKey;
let otherPublicKeyJwk: JsonWebKey;

beforeAll(async () => {
  ({ privateKey, publicJwk: publicKeyJwk } = await keypair());
  ({ publicJwk: otherPublicKeyJwk } = await keypair());
});

function tokenFor(device: string, exp?: number) {
  const iat = Math.floor(Date.now() / 1000);
  const payload: ActivationToken = {
    key: { v: KEY_VERSION, id: KEY_ID, issuedAt: iat - 60, devices: 3 },
    device,
    iat,
    exp: exp ?? iat + 1000,
  };
  return signActivationToken(payload, privateKey);
}

interface Recorded {
  url: string;
  method: string;
  body: unknown;
}

function fakeServer(respond: (request: ActivationRequest) => Promise<ActivationResult>) {
  const calls: Recorded[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url === `${API}/activate`) {
      return Response.json(await respond(ActivationRequest.parse(body)));
    }
    if (url.startsWith(`${API}/devices/`)) return Response.json({ devices: [], limit: 3 });
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch: fetchImpl };
}

const invalidKeyServer = () => fakeServer(async () => ({ status: "invalid-key" }));
const offline: typeof fetch = () => Promise.reject(new TypeError("offline"));

function clientFor(
  storage: LicenseStorage,
  fetchImpl: typeof fetch,
  verifyKey: JsonWebKey = publicKeyJwk,
) {
  return createActivationClient({
    apiBaseUrl: API,
    publicKeyJwk: verifyKey,
    storage,
    device: { name: "Premiere on Mac", host: "premiere" },
    fetch: fetchImpl,
  });
}

describe("device", () => {
  it("generates a v4 UUID once and persists it across client instances", () => {
    expect(randomUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const storage = memoryStorage();
    const first = clientFor(storage, offline).getDevice();
    const second = clientFor(storage, offline).getDevice();
    expect(second).toEqual(first);
    expect(first).toMatchObject({ name: "Premiere on Mac", host: "premiere" });
    expect(storage.data.get(DEVICE_ID_STORAGE_NAME)).toBe(first.id);
    expect(clientFor(memoryStorage(), offline).getDevice().id).not.toBe(first.id);
  });
});

describe("activation client", () => {
  it("is unknown before Activation", async () => {
    expect(await clientFor(memoryStorage(), offline).status()).toBe("unknown");
  });

  it("activates, stores the token and is active offline afterwards", async () => {
    const storage = memoryStorage();
    const { key } = await generateKey();
    const server = fakeServer(async (request) => ({
      status: "activated",
      token: await tokenFor(request.device.id),
    }));
    const client = clientFor(storage, server.fetch);

    const result = await client.activate(key.toLowerCase().replace(/-/g, " "));
    expect(result.status).toBe("activated");
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]).toMatchObject({
      url: `${API}/activate`,
      method: "POST",
      body: { key, device: client.getDevice() },
    });
    expect(storage.data.has(TOKEN_STORAGE_NAME)).toBe(true);

    expect(await clientFor(storage, offline).status()).toBe("active");
    expect(server.calls).toHaveLength(1);
  });

  it("passes device-limit through and stores nothing", async () => {
    const storage = memoryStorage();
    const { key } = await generateKey();
    const devices = [1, 2, 3].map((n) => ({
      id: `device-${n}`,
      name: `Mac ${n}`,
      host: "premiere" as const,
      activatedAt: 1_700_000_000,
    }));
    const server = fakeServer(async () => ({ status: "device-limit", devices }));
    const client = clientFor(storage, server.fetch);
    expect(await client.activate(key)).toEqual({ status: "device-limit", devices });
    expect(storage.data.has(TOKEN_STORAGE_NAME)).toBe(false);
    expect(await client.status()).toBe("unknown");
  });

  it("passes the server's invalid-key through and rejects a mistyped Key without a request", async () => {
    const storage = memoryStorage();
    const { key } = await generateKey();
    const server = invalidKeyServer();
    const client = clientFor(storage, server.fetch);

    expect(await client.activate(key)).toEqual({ status: "invalid-key" });
    expect(server.calls).toHaveLength(1);

    const last = key.at(-1);
    expect(await client.activate(key.slice(0, -1) + (last === "A" ? "B" : "A"))).toEqual({
      status: "invalid-key",
    });
    expect(server.calls).toHaveLength(1);
    expect(storage.data.has(TOKEN_STORAGE_NAME)).toBe(false);
  });

  it("reports expired past exp and inactive for a foreign, unsigned-by-us or garbled token", async () => {
    const storage = memoryStorage();
    const client = clientFor(storage, offline);
    const device = client.getDevice().id;
    const past = Math.floor(Date.now() / 1000) - 10;

    storage.data.set(TOKEN_STORAGE_NAME, await tokenFor(device, past));
    expect(await client.status()).toBe("expired");

    storage.data.set(TOKEN_STORAGE_NAME, await tokenFor("another-device"));
    expect(await client.status()).toBe("inactive");

    storage.data.set(TOKEN_STORAGE_NAME, await tokenFor(device));
    expect(await client.status()).toBe("active");
    expect(await clientFor(storage, offline, otherPublicKeyJwk).status()).toBe("inactive");

    storage.data.set(TOKEN_STORAGE_NAME, "garbage");
    expect(await client.status()).toBe("inactive");
  });

  it("refuses to store a token that does not verify for this Device", async () => {
    const storage = memoryStorage();
    const { key } = await generateKey();
    const server = fakeServer(async () => ({
      status: "activated",
      token: await tokenFor("another-device"),
    }));
    await expect(clientFor(storage, server.fetch).activate(key)).rejects.toBeInstanceOf(
      ActivationTokenError,
    );
    expect(storage.data.has(TOKEN_STORAGE_NAME)).toBe(false);
  });

  it("throws ActivationNetworkError when the server is unreachable or answers nonsense", async () => {
    const { key } = await generateKey();
    await expect(clientFor(memoryStorage(), offline).activate(key)).rejects.toBeInstanceOf(
      ActivationNetworkError,
    );
    const html = clientFor(memoryStorage(), async () => new Response("<html>", { status: 502 }));
    await expect(html.activate(key)).rejects.toBeInstanceOf(ActivationNetworkError);
  });

  it("deactivate removes the token and frees the Device slot on the server when online", async () => {
    const storage = memoryStorage();
    const { key } = await generateKey();
    const server = fakeServer(async (request) => ({
      status: "activated",
      token: await tokenFor(request.device.id),
    }));
    const client = clientFor(storage, server.fetch);
    await client.activate(key);

    expect(await client.deactivate()).toEqual({ released: true });
    const call = server.calls.at(-1)!;
    expect(call.method).toBe("DELETE");
    expect(call.url.startsWith(`${API}/devices/${client.getDevice().id}?key=ICG1-`)).toBe(true);
    expect(await client.status()).toBe("unknown");
  });

  it("deactivate still clears the token when offline", async () => {
    const storage = memoryStorage();
    const client = clientFor(storage, offline);
    storage.data.set(TOKEN_STORAGE_NAME, await tokenFor(client.getDevice().id));
    expect(await client.deactivate()).toEqual({ released: false });
    expect(await client.status()).toBe("unknown");
  });
});
