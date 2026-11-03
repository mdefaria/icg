---
status: accepted
---

# Cloudflare Worker backend, Stripe, self-issued Keys, no accounts

The whole server side is one Cloudflare Worker (TypeScript) with D1 for Keys and Devices and R2 for installers: a Stripe webhook that issues a signed Key and emails it, Activation (3 Devices per Key), a Device-management page keyed by the Key itself, a version check and Key-gated downloads. There are no buyer accounts. The product is a £10-range one-time purchase, so the server exists only to prove purchase and hand over files; an account system, a .NET service or a merchant-of-record platform would each add cost or admin out of proportion to that job. Stripe (plus Stripe Tax) was chosen over a merchant of record knowingly: the business, registered in the UK, accepts handling EU non-Union OSS VAT filings itself in exchange for roughly 4% of revenue.

## Consequences

- Keys are offline-verifiable (asymmetric signature); Hosts only go online for Activation, the version check and opt-in crash reports.
- Agencies buy quantity N and receive N Keys, one per Seat.
- Moving off Cloudflare later means re-homing a small SQLite schema and a bucket, nothing more.
