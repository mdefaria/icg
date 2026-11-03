import { describe, expect, it } from "vitest";
import { signStripePayload, verifyStripeSignature } from "./stripe";

const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = 1_800_000_000;

describe("Stripe webhook signature", () => {
  it("accepts a fresh signature made with the secret", async () => {
    const header = await signStripePayload(payload, secret, now);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(await verifyStripeSignature(payload, header, secret, now + 10)).toBe(true);
  });

  it("accepts a header carrying several v1 signatures when one matches", async () => {
    const header = await signStripePayload(payload, secret, now);
    const rotated = `${header},v1=${"0".repeat(64)}`;
    expect(await verifyStripeSignature(payload, rotated, secret, now)).toBe(true);
  });

  it("rejects a wrong secret, a changed body and a missing header", async () => {
    const header = await signStripePayload(payload, secret, now);
    expect(await verifyStripeSignature(payload, header, "whsec_other", now)).toBe(false);
    expect(await verifyStripeSignature(`${payload} `, header, secret, now)).toBe(false);
    expect(await verifyStripeSignature(payload, null, secret, now)).toBe(false);
    expect(await verifyStripeSignature(payload, "garbage", secret, now)).toBe(false);
  });

  it("rejects a signature outside the five minute tolerance", async () => {
    const header = await signStripePayload(payload, secret, now);
    expect(await verifyStripeSignature(payload, header, secret, now + 301)).toBe(false);
    expect(await verifyStripeSignature(payload, header, secret, now + 299)).toBe(true);
  });
});
