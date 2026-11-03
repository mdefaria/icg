import { z } from "zod";
import type { Env } from "./env";

const STRIPE_API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;
const encoder = new TextEncoder();

export const CheckoutInput = z.object({
  quantity: z.number().int().min(1).max(10),
  email: z.email().optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;

export const StripeEvent = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.unknown() }),
});
export type StripeEvent = z.infer<typeof StripeEvent>;

export const CheckoutSession = z.object({
  id: z.string().min(1),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  customer_details: z.object({ email: z.string().nullable() }).nullable().optional(),
  customer_email: z.string().nullable().optional(),
  amount_total: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
});
export type CheckoutSession = z.infer<typeof CheckoutSession>;

const LineItems = z.object({
  data: z.array(z.object({ quantity: z.number().int().nonnegative().nullable() })),
});

function form(fields: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(name, String(value));
  }
  return params;
}

async function stripeRequest(
  env: Env,
  method: "GET" | "POST",
  path: string,
  body?: URLSearchParams,
) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ?? null,
  });
  if (!response.ok) {
    throw new Error(`stripe ${method} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function createCheckoutSession(
  env: Env,
  input: CheckoutInput,
): Promise<{ id: string; url: string }> {
  const json = await stripeRequest(
    env,
    "POST",
    "/checkout/sessions",
    form({
      mode: "payment",
      "line_items[0][price]": env.STRIPE_PRICE_ID,
      "line_items[0][quantity]": input.quantity,
      "line_items[0][adjustable_quantity][enabled]": true,
      "line_items[0][adjustable_quantity][minimum]": 1,
      "line_items[0][adjustable_quantity][maximum]": 10,
      "automatic_tax[enabled]": true,
      "tax_id_collection[enabled]": true,
      customer_creation: "always",
      billing_address_collection: "required",
      customer_email: input.email,
      success_url: `${env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.SITE_URL}/#pricing`,
    }),
  );
  return z.object({ id: z.string().min(1), url: z.url() }).parse(json);
}

export async function fetchCheckoutQuantity(env: Env, sessionId: string): Promise<number> {
  const json = await stripeRequest(env, "GET", `/checkout/sessions/${sessionId}/line_items`);
  return LineItems.parse(json).data.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signStripePayload(
  payload: string,
  secret: string,
  timestamp: number,
): Promise<string> {
  return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${payload}`)}`;
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now: number,
): Promise<boolean> {
  if (!header) return false;
  const fields = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const [name, value] = part.split("=", 2);
    if (!name || !value) continue;
    fields.set(name, [...(fields.get(name) ?? []), value]);
  }
  const timestamp = Number(fields.get("t")?.[0]);
  const candidates = fields.get("v1") ?? [];
  if (!Number.isInteger(timestamp) || candidates.length === 0) return false;
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return candidates.some((candidate) => timingSafeEqual(candidate, expected));
}
