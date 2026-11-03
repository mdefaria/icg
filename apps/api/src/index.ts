import { ActivationRequest, DEVICES_PER_KEY, KEY_VERSION, type Device } from "@icg/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  activeKeyIdsForEmail,
  activeKeyIdsForPurchase,
  findActiveKey,
  getPurchase,
  hasStripeEvent,
  issueKeys,
  listDevices,
  markPurchaseEmailed,
  removeDevice,
  upsertDevice,
  type IssuedKey,
  type KeyRow,
} from "./db";
import { keysEmail, sendEmail } from "./email";
import { nowSeconds, type Env } from "./env";
import { formatKey, generateKey, parseKey } from "./key";
import { ARTIFACTS, Host, versionFor } from "./releases";
import {
  CheckoutInput,
  CheckoutSession,
  StripeEvent,
  createCheckoutSession,
  fetchCheckoutQuantity,
  verifyStripeSignature,
} from "./stripe";
import {
  ACTIVATION_TOKEN_TTL_SECONDS,
  importPrivateKey,
  signActivationToken,
  signKeyPayload,
} from "./token";

const PURCHASE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
const MAX_KEYS_PER_PURCHASE = 100;

const privateKeys = new Map<string, Promise<CryptoKey>>();
function privateKeyFor(env: Env): Promise<CryptoKey> {
  let key = privateKeys.get(env.SIGNING_PRIVATE_KEY_JWK);
  if (!key) {
    key = importPrivateKey(JSON.parse(env.SIGNING_PRIVATE_KEY_JWK) as JsonWebKey);
    privateKeys.set(env.SIGNING_PRIVATE_KEY_JWK, key);
  }
  return key;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function keyFromQuery(env: Env, raw: string | undefined): Promise<KeyRow | null> {
  const id = raw ? await parseKey(raw) : null;
  return id ? findActiveKey(env.DB, id) : null;
}

async function emailKeys(env: Env, to: string, keyIds: string[], resend: boolean): Promise<void> {
  const keys = await Promise.all(keyIds.map((id) => formatKey(id)));
  await sendEmail(env, to, keysEmail(keys, env.SITE_URL, resend));
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "DELETE", "OPTIONS"] }));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "internal" }, 500);
});

app.get("/", (c) => c.json({ name: "icg-api", keyVersion: KEY_VERSION }));

app.post("/checkout", async (c) => {
  const input = CheckoutInput.safeParse(await readJson(c.req.raw));
  if (!input.success) return c.json({ error: "invalid-request" }, 400);
  const session = await createCheckoutSession(c.env, input.data);
  return c.json({ url: session.url });
});

app.post("/stripe/webhook", async (c) => {
  const payload = await c.req.text();
  const signed = await verifyStripeSignature(
    payload,
    c.req.header("stripe-signature") ?? null,
    c.env.STRIPE_WEBHOOK_SECRET,
    nowSeconds(),
  );
  if (!signed) return c.json({ error: "bad-signature" }, 400);

  let event: StripeEvent;
  try {
    event = StripeEvent.parse(JSON.parse(payload));
  } catch {
    return c.json({ error: "invalid-event" }, 400);
  }
  if (!PURCHASE_EVENTS.has(event.type)) return c.json({ received: true, ignored: event.type });

  const session = CheckoutSession.safeParse(event.data.object);
  if (!session.success) return c.json({ error: "invalid-session" }, 400);
  if (session.data.payment_status !== "paid") {
    return c.json({ received: true, ignored: session.data.payment_status });
  }

  const existing = await getPurchase(c.env.DB, session.data.id);
  if (existing || (await hasStripeEvent(c.env.DB, event.id))) {
    if (existing && existing.emailed_at === null) {
      await emailKeys(
        c.env,
        existing.email,
        await activeKeyIdsForPurchase(c.env.DB, existing.id),
        false,
      );
      await markPurchaseEmailed(c.env.DB, existing.id, nowSeconds());
    }
    return c.json({ received: true, duplicate: true });
  }

  const email = (session.data.customer_details?.email ?? session.data.customer_email)
    ?.trim()
    .toLowerCase();
  if (!email) return c.json({ error: "no-email" }, 422);

  const quantity = Math.min(
    MAX_KEYS_PER_PURCHASE,
    Math.max(1, await fetchCheckoutQuantity(c.env, session.data.id)),
  );
  const issuedAt = nowSeconds();
  const privateKey = await privateKeyFor(c.env);
  const keys: IssuedKey[] = [];
  for (let i = 0; i < quantity; i++) {
    const { id } = await generateKey();
    const payload = { v: KEY_VERSION, id, issuedAt, devices: DEVICES_PER_KEY } as const;
    keys.push({
      id,
      issuedAt,
      devices: DEVICES_PER_KEY,
      signature: await signKeyPayload(payload, privateKey),
    });
  }

  try {
    await issueKeys(
      c.env.DB,
      {
        id: session.data.id,
        email,
        quantity,
        amount_total: session.data.amount_total ?? null,
        currency: session.data.currency ?? null,
        created_at: issuedAt,
      },
      keys,
      { id: event.id, type: event.type, receivedAt: issuedAt },
    );
  } catch (error) {
    if (await hasStripeEvent(c.env.DB, event.id))
      return c.json({ received: true, duplicate: true });
    throw error;
  }

  await emailKeys(
    c.env,
    email,
    keys.map((key) => key.id),
    false,
  );
  await markPurchaseEmailed(c.env.DB, session.data.id, nowSeconds());
  return c.json({ received: true, issued: quantity });
});

app.post("/activate", async (c) => {
  const input = ActivationRequest.safeParse(await readJson(c.req.raw));
  if (!input.success) return c.json({ error: "invalid-request" }, 400);

  const key = await keyFromQuery(c.env, input.data.key);
  if (!key) return c.json({ status: "invalid-key" }, 401);

  const devices = await listDevices(c.env.DB, key.id);
  const known = devices.find((device) => device.id === input.data.device.id);
  if (!known && devices.length >= key.devices) {
    return c.json({ status: "device-limit", devices });
  }

  const activatedAt = known?.activatedAt ?? nowSeconds();
  const device: Device = { ...input.data.device, activatedAt };
  await upsertDevice(c.env.DB, key.id, device);

  const iat = nowSeconds();
  const token = await signActivationToken(
    {
      key: { v: KEY_VERSION, id: key.id, issuedAt: key.issued_at, devices: key.devices },
      device: device.id,
      iat,
      exp: iat + ACTIVATION_TOKEN_TTL_SECONDS,
    },
    await privateKeyFor(c.env),
  );
  return c.json({ status: "activated", token });
});

app.get("/devices", async (c) => {
  const key = await keyFromQuery(c.env, c.req.query("key"));
  if (!key) return c.json({ error: "invalid-key" }, 401);
  return c.json({ devices: await listDevices(c.env.DB, key.id), limit: key.devices });
});

app.delete("/devices/:id", async (c) => {
  const key = await keyFromQuery(c.env, c.req.query("key"));
  if (!key) return c.json({ error: "invalid-key" }, 401);
  const removed = await removeDevice(c.env.DB, key.id, c.req.param("id"));
  if (!removed) return c.json({ error: "not-found" }, 404);
  return c.json({ devices: await listDevices(c.env.DB, key.id), limit: key.devices });
});

app.post("/keys/resend", async (c) => {
  const input = z.object({ email: z.email() }).safeParse(await readJson(c.req.raw));
  if (!input.success) return c.json({ error: "invalid-request" }, 400);
  const email = input.data.email.trim().toLowerCase();
  const keyIds = await activeKeyIdsForEmail(c.env.DB, email);
  if (keyIds.length > 0) await emailKeys(c.env, email, keyIds, true);
  return c.json({ ok: true });
});

app.get("/version", (c) => {
  const host = Host.safeParse(c.req.query("host"));
  if (!host.success) return c.json({ error: "unknown-host" }, 400);
  return c.json(versionFor(host.data, new URL(c.req.url).origin, c.env.SITE_URL));
});

app.get("/download/:artifact", async (c) => {
  const name = c.req.param("artifact");
  const artifact = ARTIFACTS[name];
  if (!artifact) return c.json({ error: "not-found" }, 404);
  const key = await keyFromQuery(c.env, c.req.query("key"));
  if (!key) return c.json({ error: "invalid-key" }, 401);
  const object = await c.env.BUCKET.get(name);
  if (!object) return c.json({ error: "not-found" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": artifact.contentType,
      "content-length": String(object.size),
      "content-disposition": `attachment; filename="${name}"`,
      etag: object.httpEtag,
      "cache-control": "private, no-store",
    },
  });
});

export default app;
