import {
  ActivationResult,
  DEVICES_PER_KEY,
  Device,
  KEY_VERSION,
  type KeyPayload,
} from "@icg/shared";
import {
  ACTIVATION_TOKEN_TTL_SECONDS,
  base64UrlDecode,
  base64UrlEncode,
  generateKey,
  importPrivateKey,
  importPublicKey,
  parseKey,
  signKeyPayload,
  verifyActivationToken,
  verifyKeyPayload,
  type ActivationToken,
} from "@icg/licensing";
import { env, fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { issueKeys, type KeyRow } from "./db";
import { nowSeconds } from "./env";
import { signStripePayload } from "./stripe";

const API = "https://api.icg.test";
const KEY_PATTERN = /ICG1(?:-[0-9A-Z]{5}){4}/g;

interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

function json(body: unknown, init: RequestInit = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  };
}

function expectResend(sent: SentEmail[]) {
  fetchMock
    .get("https://api.resend.com")
    .intercept({ method: "POST", path: "/emails" })
    .reply(200, (request) => {
      sent.push(JSON.parse(String(request.body)) as SentEmail);
      return JSON.stringify({ id: `email_${sent.length}` });
    });
}

function expectLineItems(sessionId: string, quantity: number) {
  fetchMock
    .get("https://api.stripe.com")
    .intercept({ method: "GET", path: `/v1/checkout/sessions/${sessionId}/line_items` })
    .reply(200, JSON.stringify({ object: "list", data: [{ quantity }] }), {
      headers: { "content-type": "application/json" },
    });
}

async function postWebhook(event: unknown, secret = env.STRIPE_WEBHOOK_SECRET, at = nowSeconds()) {
  const payload = JSON.stringify(event);
  return SELF.fetch(`${API}/stripe/webhook`, {
    method: "POST",
    headers: { "stripe-signature": await signStripePayload(payload, secret, at) },
    body: payload,
  });
}

function completedSession(id: string, email: string, eventId = `evt_${id}`) {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id,
        object: "checkout.session",
        payment_status: "paid",
        customer_details: { email },
        amount_total: 2997,
        currency: "gbp",
      },
    },
  };
}

async function seedKey(email = "buyer@example.com") {
  const { id, key } = await generateKey();
  const issuedAt = nowSeconds();
  const privateKey = await importPrivateKey(JSON.parse(env.SIGNING_PRIVATE_KEY_JWK) as JsonWebKey);
  const payload = { v: KEY_VERSION, id, issuedAt, devices: DEVICES_PER_KEY } as const;
  await issueKeys(
    env.DB,
    {
      id: `cs_${id}`,
      email,
      quantity: 1,
      amount_total: 999,
      currency: "gbp",
      created_at: issuedAt,
    },
    [
      {
        id,
        issuedAt,
        devices: DEVICES_PER_KEY,
        signature: await signKeyPayload(payload, privateKey),
      },
    ],
    { id: `evt_${id}`, type: "checkout.session.completed", receivedAt: issuedAt },
  );
  return { id, key };
}

async function activate(key: string, deviceId: string, host: Device["host"] = "premiere") {
  const response = await SELF.fetch(
    `${API}/activate`,
    json({ key, device: { id: deviceId, name: `Studio ${deviceId}`, host } }),
  );
  return { status: response.status, result: ActivationResult.parse(await response.json()) };
}

async function devicesFor(key: string) {
  const response = await SELF.fetch(`${API}/devices?key=${encodeURIComponent(key)}`);
  expect(response.status).toBe(200);
  return z.object({ devices: z.array(Device), limit: z.number() }).parse(await response.json());
}

describe("POST /checkout", () => {
  it("creates a Stripe Checkout Session for the quantity and returns its url", async () => {
    let form = "";
    fetchMock
      .get("https://api.stripe.com")
      .intercept({ method: "POST", path: "/v1/checkout/sessions" })
      .reply(200, (request) => {
        form = String(request.body);
        return JSON.stringify({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/c/pay/cs_test_1",
        });
      });

    const response = await SELF.fetch(`${API}/checkout`, json({ quantity: 3 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });

    const params = new URLSearchParams(form);
    expect(params.get("mode")).toBe("payment");
    expect(params.get("line_items[0][price]")).toBe(env.STRIPE_PRICE_ID);
    expect(params.get("line_items[0][quantity]")).toBe("3");
    expect(params.get("line_items[0][adjustable_quantity][maximum]")).toBe("10");
    expect(params.get("automatic_tax[enabled]")).toBe("true");
    expect(params.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");
  });

  it("rejects a quantity outside 1..10 without calling Stripe", async () => {
    expect((await SELF.fetch(`${API}/checkout`, json({ quantity: 11 }))).status).toBe(400);
    expect((await SELF.fetch(`${API}/checkout`, json({ quantity: 0 }))).status).toBe(400);
    expect((await SELF.fetch(`${API}/checkout`, { method: "POST", body: "nope" })).status).toBe(
      400,
    );
  });
});

describe("POST /stripe/webhook", () => {
  it("rejects an invalid or stale signature before touching anything", async () => {
    const event = completedSession("cs_bad", "buyer@example.com");
    expect((await postWebhook(event, "whsec_wrong")).status).toBe(400);
    expect((await postWebhook(event, env.STRIPE_WEBHOOK_SECRET, nowSeconds() - 600)).status).toBe(
      400,
    );
    const unsigned = await SELF.fetch(`${API}/stripe/webhook`, json(event));
    expect(unsigned.status).toBe(400);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM keys").first("n")).toBe(0);
  });

  it("issues one Key per Seat for quantity 3, emails them once and ignores a replay", async () => {
    const sent: SentEmail[] = [];
    expectLineItems("cs_qty3", 3);
    expectResend(sent);

    const event = completedSession("cs_qty3", "Agency@Example.com");
    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, issued: 3 });

    const rows = (
      await env.DB.prepare("SELECT * FROM keys WHERE purchase_id = ?").bind("cs_qty3").all<KeyRow>()
    ).results;
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.email === "agency@example.com")).toBe(true);
    expect(rows.every((row) => row.devices === DEVICES_PER_KEY)).toBe(true);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["agency@example.com"]);
    expect(sent[0]!.subject).toContain("Keys");
    const mailedKeys = sent[0]!.text.match(KEY_PATTERN) ?? [];
    expect(mailedKeys).toHaveLength(3);
    expect(sent[0]!.html.match(KEY_PATTERN)).toHaveLength(3);
    const mailedIds = await Promise.all(mailedKeys.map((key) => parseKey(key)));
    expect(new Set(mailedIds)).toEqual(new Set(rows.map((row) => row.id)));

    const publicKey = await importPublicKey(JSON.parse(env.SIGNING_PUBLIC_KEY_JWK) as JsonWebKey);
    for (const row of rows) {
      const payload: KeyPayload = {
        v: KEY_VERSION,
        id: row.id,
        issuedAt: row.issued_at,
        devices: row.devices,
      };
      expect(await verifyKeyPayload(payload, row.signature, publicKey)).toBe(true);
    }

    const replay = await postWebhook(event);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });

    const sameSessionNewEvent = await postWebhook(
      completedSession("cs_qty3", "agency@example.com", "evt_retry"),
    );
    expect(sameSessionNewEvent.status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM keys").first("n")).toBe(3);
    expect(sent).toHaveLength(1);
  });

  it("acknowledges other event types and unpaid sessions without issuing Keys", async () => {
    const other = await postWebhook({
      id: "evt_x",
      type: "payment_intent.created",
      data: { object: {} },
    });
    expect(other.status).toBe(200);
    const unpaid = completedSession("cs_unpaid", "buyer@example.com");
    unpaid.data.object.payment_status = "unpaid";
    expect((await postWebhook(unpaid)).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM keys").first("n")).toBe(0);
  });

  it("fails loudly when the email cannot be sent, then sends it on the Stripe retry", async () => {
    expectLineItems("cs_mailfail", 1);
    fetchMock
      .get("https://api.resend.com")
      .intercept({ method: "POST", path: "/emails" })
      .reply(500, "resend down");
    const event = completedSession("cs_mailfail", "buyer@example.com");
    expect((await postWebhook(event)).status).toBe(500);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM keys").first("n")).toBe(1);

    const sent: SentEmail[] = [];
    expectResend(sent);
    expect((await postWebhook(event)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text.match(KEY_PATTERN)).toHaveLength(1);
  });
});

describe("POST /activate", () => {
  it("activates up to the Device limit, then reports device-limit with the Devices", async () => {
    const { id, key } = await seedKey();
    for (const device of ["d1", "d2", "d3"]) {
      const { status, result } = await activate(key, device);
      expect(status).toBe(200);
      expect(result.status).toBe("activated");
    }
    const { result } = await activate(key, "d4", "resolve");
    expect(result.status).toBe("device-limit");
    if (result.status !== "device-limit") throw new Error("unreachable");
    expect(result.devices.map((device) => device.id)).toEqual(["d1", "d2", "d3"]);
    expect((await devicesFor(key)).devices).toHaveLength(3);
    expect((await devicesFor(key)).limit).toBe(DEVICES_PER_KEY);
    expect(id).toHaveLength(16);
  });

  it("re-activating the same Device is idempotent", async () => {
    const { key } = await seedKey();
    await activate(key, "d1");
    await activate(key, "d2");
    await activate(key, "d3");
    const again = await activate(key, "d2", "web");
    expect(again.result.status).toBe("activated");
    const { devices } = await devicesFor(key);
    expect(devices).toHaveLength(3);
    expect(devices.find((device) => device.id === "d2")?.host).toBe("web");
  });

  it("returns a token that verifies offline with the public key and fails when tampered", async () => {
    const { id, key } = await seedKey();
    const { result } = await activate(key, "studio-mac");
    if (result.status !== "activated") throw new Error("expected activation");

    const publicJwk = JSON.parse(env.SIGNING_PUBLIC_KEY_JWK) as JsonWebKey;
    const verified = await verifyActivationToken(result.token, publicJwk);
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("unreachable");
    expect(
      await verifyActivationToken(result.token, publicJwk, undefined, { ed25519: "noble" }),
    ).toEqual(verified);
    expect(verified.payload.key).toMatchObject({ v: KEY_VERSION, id, devices: DEVICES_PER_KEY });
    expect(verified.payload.device).toBe("studio-mac");
    expect(verified.payload.exp - verified.payload.iat).toBe(ACTIVATION_TOKEN_TTL_SECONDS);

    const [header, body, signature] = result.token.split(".") as [string, string, string];
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)!)) as ActivationToken;
    claims.key.devices = 999;
    const tamperedBody = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
    const tampered = await verifyActivationToken(
      `${header}.${tamperedBody}.${signature}`,
      publicJwk,
    );
    expect(tampered).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects an unknown Key, a Key with a typo and a malformed body", async () => {
    const { key } = await seedKey();
    const unknown = await activate((await generateKey()).key, "d1");
    expect(unknown.status).toBe(401);
    expect(unknown.result).toEqual({ status: "invalid-key" });
    const last = key.at(-1);
    const typo = await activate(key.slice(0, -1) + (last === "A" ? "B" : "A"), "d1");
    expect(typo.result).toEqual({ status: "invalid-key" });
    const malformed = await SELF.fetch(`${API}/activate`, json({ key, device: { id: "d1" } }));
    expect(malformed.status).toBe(400);
  });
});

describe("Devices", () => {
  it("lists Devices and removing one frees a slot", async () => {
    const { key } = await seedKey();
    await activate(key, "d1");
    await activate(key, "d2");
    await activate(key, "d3");
    expect((await activate(key, "d4")).result.status).toBe("device-limit");

    const removed = await SELF.fetch(`${API}/devices/d1?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect((await devicesFor(key)).devices.map((device) => device.id)).toEqual(["d2", "d3"]);

    expect((await activate(key, "d4")).result.status).toBe("activated");
    expect((await devicesFor(key)).devices.map((device) => device.id)).toEqual(["d2", "d3", "d4"]);

    const missing = await SELF.fetch(`${API}/devices/nope?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });

  it("rejects a bad Key", async () => {
    expect((await SELF.fetch(`${API}/devices?key=ICG1-NOPE`)).status).toBe(401);
    expect((await SELF.fetch(`${API}/devices`)).status).toBe(401);
    const { key } = await generateKey();
    expect(
      (await SELF.fetch(`${API}/devices/d1?key=${encodeURIComponent(key)}`, { method: "DELETE" }))
        .status,
    ).toBe(401);
  });
});

describe("POST /keys/resend", () => {
  it("emails every Key registered to the address and always answers 200", async () => {
    const first = await seedKey("owner@example.com");
    const second = await seedKey("owner@example.com");
    await seedKey("someone-else@example.com");
    const sent: SentEmail[] = [];
    expectResend(sent);

    const known = await SELF.fetch(`${API}/keys/resend`, json({ email: "Owner@Example.com" }));
    expect(known.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["owner@example.com"]);
    expect(sent[0]!.text).toContain(first.key);
    expect(sent[0]!.text).toContain(second.key);
    expect(sent[0]!.text.match(KEY_PATTERN)).toHaveLength(2);

    const unknown = await SELF.fetch(`${API}/keys/resend`, json({ email: "nobody@example.com" }));
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);

    expect((await SELF.fetch(`${API}/keys/resend`, json({ email: "not-an-email" }))).status).toBe(
      400,
    );
  });
});

describe("GET /version", () => {
  it("returns latest, url and notes per Host", async () => {
    const premiere = await SELF.fetch(`${API}/version?host=premiere`);
    expect(premiere.status).toBe(200);
    expect(await premiere.json()).toEqual({
      latest: "0.1.0",
      url: `${API}/download/icg-premiere-0.1.0.zip`,
      notes: expect.any(String),
    });
    const web = await SELF.fetch(`${API}/version?host=web`);
    expect(((await web.json()) as { url: string }).url).toBe(`${env.SITE_URL}/app`);
    expect((await SELF.fetch(`${API}/version?host=finalcut`)).status).toBe(400);
    expect((await SELF.fetch(`${API}/version`)).status).toBe(400);
  });
});

describe("GET /download/:artifact", () => {
  const artifact = "icg-premiere-0.1.0.zip";

  it("rejects a bad Key and unknown artifacts", async () => {
    await env.BUCKET.put(artifact, "zip bytes");
    expect((await SELF.fetch(`${API}/download/${artifact}`)).status).toBe(401);
    const { key } = await generateKey();
    expect(
      (await SELF.fetch(`${API}/download/${artifact}?key=${encodeURIComponent(key)}`)).status,
    ).toBe(401);
    const { key: good } = await seedKey();
    expect(
      (await SELF.fetch(`${API}/download/secret.zip?key=${encodeURIComponent(good)}`)).status,
    ).toBe(404);
  });

  it("streams the artifact from R2 for a valid Key", async () => {
    await env.BUCKET.put(artifact, "zip bytes");
    const { key } = await seedKey();
    const response = await SELF.fetch(`${API}/download/${artifact}?key=${encodeURIComponent(key)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${artifact}"`);
    expect(await response.text()).toBe("zip bytes");
  });

  it("answers 404 when the artifact is listed but not uploaded yet", async () => {
    const { key } = await seedKey();
    const response = await SELF.fetch(
      `${API}/download/icg-resolve-0.1.0.zip?key=${encodeURIComponent(key)}`,
    );
    expect(response.status).toBe(404);
  });
});
