# S7: commerce round trip on Cloudflare

## Goal

Prove, with local tests only, the whole paid path of ADR 0004: Stripe Checkout -> webhook -> N
signed Keys stored in D1 and emailed -> Activation returning an offline-verifiable token -> Device
limit, self-service Device removal, resend-Key, version check and Key-gated R2 downloads. No
buyer accounts, no real credentials.

## What was built

One Cloudflare Worker (`src/index.ts`, Hono router) with D1 (`DB`) and R2 (`BUCKET`) bindings.

| Route                          | Does                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /checkout`               | `{ quantity: 1..10, email? }` -> creates a Stripe Checkout Session (one GBP Price, adjustable quantity 1..10, Stripe Tax on) and returns `{ url }` |
| `POST /stripe/webhook`         | Verifies `Stripe-Signature` (WebCrypto HMAC-SHA256, 5 min tolerance), issues one Key per Seat, stores them, emails them, records the event id      |
| `POST /activate`               | Body `ActivationRequest` -> `ActivationResult` (`activated` + token, `device-limit` + Devices, or `invalid-key`)                                   |
| `GET /devices?key=`            | `{ devices: Device[], limit }` for the Device page                                                                                                 |
| `DELETE /devices/:id?key=`     | Removes a Device, frees a slot                                                                                                                     |
| `POST /keys/resend`            | `{ email }` -> re-emails every Key for that address; always 200 so it leaks nothing                                                                |
| `GET /version?host=`           | `{ latest, url, notes }` from the static table in `src/releases.ts`                                                                                |
| `GET /download/:artifact?key=` | Validates the Key, streams the artifact from R2 (allowlist in `src/releases.ts`)                                                                   |

Files:

- `src/key.ts`: the Key string. A random 80-bit id in Crockford base32 (16 chars) plus a 4-char
  check (first 20 bits of SHA-256 of the id), grouped as `ICG1-XXXXX-XXXXX-XXXXX-XXXXX`. The
  `ICG1` prefix is `KEY_VERSION`. `parseKey` is forgiving: any case, any separators, `O->0`,
  `I/L->1`; a typo fails the check locally with a 1 in a million false pass, so the landing page can
  validate before calling the API. `KeyPayload.id` is the bare 16-char id.
- `src/token.ts`: pure WebCrypto, no Worker types, ready to move to `packages/licensing`. Signs
  the `KeyPayload` stored next to each Key (tamper evidence for the D1 row) and mints the
  activation token: compact JWS (`{"alg":"EdDSA","typ":"JWT"}`), payload
  `{ key: KeyPayload, device, iat, exp }`, `exp = iat + 10 years`, Ed25519.
  `verifyActivationToken(token, publicKeyJwk, now)` is what the Hosts will call offline; it
  returns `malformed | bad-signature | invalid-payload | expired` or the parsed payload.
- `src/stripe.ts`: Checkout Session creation and line-item lookup over plain `fetch` to the REST
  API (no Stripe SDK), signature verification, and `signStripePayload` used by the tests.
- `src/email.ts`: Resend over `fetch`, one plain-text + HTML template for first delivery and
  resend.
- `src/db.ts`: all D1 statements. Key issue is one `batch` (purchase + keys + stripe_event), so
  it is atomic and a duplicate event id fails the whole batch.
- `src/releases.ts`: static release table per Host and the download allowlist.
- `migrations/0001_init.sql`: `purchases`, `keys`, `devices`, `stripe_events`. All timestamps
  are epoch seconds (matches Stripe and JWT `iat`/`exp`; `KeyPayload.issuedAt` and
  `Device.activatedAt` follow that).
- `scripts/generate-keypair.ts`: prints the Ed25519 public JWK for `[vars]` and the private JWK
  for the secret.

Webhook idempotency and failure handling:

- `checkout.session.completed` and `checkout.session.async_payment_succeeded` are handled;
  anything else, and sessions whose `payment_status` is not `paid`, get a 200 and are ignored.
- Replays are detected by purchase id (the session id) and by event id. A replay returns 200
  without issuing or emailing again.
- Quantity is read from Stripe (`GET /checkout/sessions/:id/line_items`) rather than trusted
  from metadata, because the quantity is adjustable on the Checkout page.
- If Resend fails after the Keys are stored the Worker answers 500, Stripe retries, and the retry
  path sends the email for a purchase whose `emailed_at` is still null. Keys are never issued
  twice.

## How to run locally

```sh
pnpm install
cd apps/api
pnpm keypair                                   # paste the private JWK into .dev.vars, public into wrangler.toml [vars]
cp .dev.vars.example .dev.vars                 # fill STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, SIGNING_PRIVATE_KEY_JWK
pnpm exec wrangler d1 migrations apply icg --local
pnpm dev                                       # http://localhost:8787
```

Forward Stripe test-mode events to it in a second terminal:

```sh
stripe listen --forward-to localhost:8787/stripe/webhook
# copy the whsec_... it prints into .dev.vars as STRIPE_WEBHOOK_SECRET, restart pnpm dev
stripe trigger checkout.session.completed      # or complete a real test Checkout from POST /checkout
```

Tests run inside workerd with `@cloudflare/vitest-pool-workers` (D1 and R2 are real local
bindings, Stripe and Resend are intercepted with `fetchMock`, a fresh Ed25519 keypair is generated
per run in `vitest.config.ts`):

```sh
pnpm test            # in apps/api
pnpm check           # at the repo root: lint, typecheck, tests for everything
```

## How to deploy

```sh
cd apps/api
pnpm exec wrangler login
pnpm exec wrangler d1 create icg               # paste database_id into wrangler.toml
pnpm exec wrangler r2 bucket create icg-downloads
pnpm exec wrangler d1 migrations apply icg --remote
pnpm keypair                                   # public JWK -> wrangler.toml [vars] SIGNING_PUBLIC_KEY_JWK
pnpm exec wrangler secret put SIGNING_PRIVATE_KEY_JWK
pnpm exec wrangler secret put STRIPE_SECRET_KEY
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
pnpm exec wrangler secret put RESEND_API_KEY
# set SITE_URL, EMAIL_FROM and STRIPE_PRICE_ID in wrangler.toml [vars]
pnpm deploy
pnpm exec wrangler r2 object put icg-downloads/icg-premiere-0.1.0.zip --file ../../dist/icg-premiere-0.1.0.zip
```

Secrets are never committed: `.dev.vars` is gitignored, `.dev.vars.example` holds placeholders,
and `wrangler.toml` only carries the public key and non-secret vars. Keep the private JWK in a
password manager; losing it means every issued activation token becomes unverifiable by a new key,
so rotation is a Host update that ships both public keys.

## Owner checklist: real Stripe test-mode purchase end to end

1. Stripe dashboard (test mode): create Product "ICG" with a one-time GBP Price; copy the
   `price_...` id into `STRIPE_PRICE_ID`. Enable Stripe Tax and set the product tax code
   (software as a service / downloadable software, `txcd_10000000` family). Set the business
   address so Tax can compute UK VAT.
2. Resend: add and verify the sending domain, create an API key, set `EMAIL_FROM` to an address on
   that domain.
3. Deploy the Worker (section above) and register a webhook endpoint in Stripe pointing at
   `https://<worker>/stripe/webhook` with events `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`; copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`.
4. `curl -X POST https://<worker>/checkout -d '{"quantity":2}' -H 'content-type: application/json'`
   and open the returned url. Pay with `4242 4242 4242 4242`, a UK address, your own email.
5. Expect one email with 2 Keys within seconds. Check the Stripe webhook log shows 200 and D1
   (`wrangler d1 execute icg --remote --command 'select * from keys'`) has 2 rows.
6. `POST /activate` three times with different Device ids, then a fourth: expect `device-limit`
   with the three Devices. Paste a token into `verifyActivationToken` with the public JWK (a
   one-line script or the token test) and confirm it verifies.
7. `GET /devices?key=`, `DELETE /devices/<id>?key=`, activate the fourth Device again: expect
   `activated`.
8. `POST /keys/resend` with the purchase email: expect the same Keys again. With an unknown email:
   200, no mail.
9. Upload a dummy zip to R2 under the artifact name and fetch `/download/icg-premiere-0.1.0.zip?key=`
   in a browser: a file download. Without the Key: 401.
10. Replay the webhook from the Stripe dashboard ("Resend"): 200, no new Keys, no new email.
11. Issue a refund in Stripe and note that nothing revokes the Key yet (see open questions).

## Findings

1. **Ed25519 JWK interop differs between runtimes.** Node 22 exports Ed25519 JWKs with
   `"alg":"Ed25519"` (new WebCrypto spec wording); workerd rejects that on import ("does not
   match requested Ed25519 curve") and only takes `"EdDSA"` or no `alg`. `token.ts` therefore
   imports only `kty/crv/x/d`. The Hosts' verifier must do the same, or embed a JWK without `alg`.
2. **Ed25519 in WebCrypto is not available in every Host runtime.** Node 22, workerd, Safari 17+,
   Firefox 130+ and Chrome 137+ have it. Premiere's CEP 11/12 embeds Chromium 88/99, which does not.
   Options for `packages/licensing`: a pure-JS fallback (`@noble/ed25519`, ~4 KB) behind the same
   `verifyActivationToken` signature, or switching the token alg to ES256 (P-256 is universal). The
   token format carries `alg`, so the switch is cheap now and expensive after launch. Decide before
   C5.
3. **`@cloudflare/vitest-pool-workers` pins vitest.** Every release since 0.13 needs vitest 4.1;
   the repo is on vitest 3.2, so `apps/api` pins `0.12.21` (vitest 2.0 to 3.2) and the matching
   `wrangler 4.72.0` / `workers-types 4.20260310.1`. Bumping vitest to 4 repo-wide unlocks the
   current line. pnpm also needs `workerd` allowed in `onlyBuiltDependencies` to silence the
   "ignored build scripts" warning; the binary works without it because the platform package is
   an optional dependency.
4. **`isolatedStorage` makes D1 tests cheap.** Each test runs against a fresh copy of D1 and R2
   and writes are rolled back afterwards, so the 17 integration tests share one migration and
   still run in under a second.
5. **Stripe's Checkout Session webhook does not include line items**, so the quantity needs a
   second call. Trusting `metadata.quantity` set at creation would break the moment the buyer
   changes the quantity on the Checkout page.
6. **Streaming from R2 beats presigned URLs here.** R2 presigned URLs need S3 credentials
   (`aws4fetch`), not bindings; streaming through the Worker costs no CPU time for the body and
   keeps the Key check in one place. If egress through the Worker ever matters, swap for a
   short-lived HMAC token in the query string and keep the Key check on the endpoint that mints it.
7. **The Key string is shorter than the suggested 5 groups.** 80 random bits plus a 20-bit check
   fit in exactly 20 Crockford characters (4 groups of 5); a fifth group would be padding. The
   check lets the landing page and the Hosts reject typos before any network call.
8. `wrangler dev` with `.dev.vars` and a local D1 serves all routes in this sandbox; the
   `Request.cf` warnings in its log are the sandbox's blocked outbound network, not a code issue.

## What remains unverified

- No real Stripe, Resend or Cloudflare account was touched: Checkout Session parameters
  (`automatic_tax`, `tax_id_collection` with `customer_creation=always`,
  `billing_address_collection=required`) are from the API reference and must be confirmed in
  test mode (checklist step 4).
- Resend deliverability (SPF/DKIM/DMARC on the sending domain) and whether Gmail files a
  monospace list of Keys as spam.
- Behaviour under concurrent duplicate webhook deliveries is covered by the UNIQUE constraint on
  `stripe_events.id` and the atomic batch, but not load-tested.

## Open questions

- **Stripe Tax settings**: tax code for the product, whether to show prices tax-inclusive in the
  UK and tax-exclusive elsewhere, and whether `tax_id_collection` (reverse charge for EU agencies)
  is worth the extra fields on the Checkout page for a £10 product.
- **EU OSS**: ADR 0004 accepts filing non-Union OSS VAT; Stripe Tax reports give the numbers but
  the registration and quarterly filing are manual. Decide who does them before the first EU sale.
- **Refunds**: the 14-day refund policy needs `charge.refunded` to revoke the Keys of that purchase
  (`keys.revoked_at` exists, no handler yet). Revoking also invalidates offline tokens only on the
  next online check, which the Hosts do not do today.
- **Email deliverability**: Resend vs. Postmark, dedicated sending domain (`keys.<domain>`), and a
  plain-text-first template to stay out of spam.
- **Rate limiting**: `/keys/resend`, `/activate` and `/checkout` are open; add a Cloudflare rate
  limiting rule or the Workers rate-limit binding before launch.
- **CORS** is `*` with no credentials. Fine for a keyless API, but worth narrowing `/checkout` and
  `/devices` to the landing origin once it exists.
- **Device fingerprint**: the API trusts `device.id` from the Host. C5 decides how it is derived
  (machine id hash) and whether the web app's Device id survives a cleared browser.
- **Token lifetime and rotation**: 10 years means a leaked private key is a 10-year problem.
  Consider 2 years plus silent re-activation, which the Hosts can do on any online moment.
