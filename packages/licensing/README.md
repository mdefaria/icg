# @icg/licensing

Key validation, Activation client, offline token verification and the update check. Host-agnostic: it only needs `fetch`, WebCrypto (`getRandomValues`, SHA-256) and a string store. The API (`apps/api`) imports the signing half from here, so both sides share one token format.

## What is in it

| Module      | For         | Exports                                                                                                 |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `key.ts`    | Hosts + API | `parseKey` (typed Key to bare id, or `null`), `formatKey`, `generateKey` (API only)                     |
| `token.ts`  | Hosts + API | `verifyActivationToken` (Hosts), `signActivationToken`, `signKeyPayload`, `importPrivateKey` (API only) |
| `client.ts` | Hosts       | `createActivationClient`, `LicenseStorage`, `ActivationNetworkError`, `ActivationTokenError`            |
| `update.ts` | Hosts       | `checkForUpdate`, `compareVersions`, `VersionResponse`                                                  |

## Wiring a Host

```ts
import { createActivationClient, checkForUpdate, parseKey } from "@icg/licensing";
import { PUBLIC_KEY_JWK } from "./license-public-key";

const licensing = createActivationClient({
  apiBaseUrl: "https://api.example.com",
  publicKeyJwk: PUBLIC_KEY_JWK,
  storage: window.localStorage,
  device: { name: machineName ?? "Premiere on Mac", host: "premiere" },
});

if ((await licensing.status()) !== "active") showActivationScreen();
```

### Typed Key

Validate in the input field before any request: `await parseKey(text)` is `null` for a wrong prefix, wrong length, characters outside Crockford base32 or a failed check digit (about 1 in a million typos pass). It forgives case, spaces, dashes and `O/I/L` look-alikes. It cannot tell whether the Key exists; only the server can. `activate` runs the same check first, so a mistyped Key returns `{ status: "invalid-key" }` without a request.

### Storage

`storage` is `{ getItem, setItem, removeItem }` with string values, so `localStorage` fits as is. The client writes two entries, `icg.device-id` and `icg.activation-token`. Per Host:

- Premiere (CEP panel): `window.localStorage`. Unverified without Premiere: confirm it survives a Premiere restart and a panel update; the extension id is part of its origin, so changing it would force a new Activation.
- Resolve (Electron): `window.localStorage` of the renderer. Do not run the panel from a random temp origin: the origin is part of the storage key.
- Web: `window.localStorage`. Clearing site data drops the Device id and the token; the buyer activates again and, if all Devices are used, removes the stale one on the Device page.

Wrap it if a Host's storage is async or throws when blocked; the interface is synchronous on purpose.

### Device naming

The client generates a random UUID v4 once and keeps it. Name it for humans, because it is what the buyer sees on the Device page:

- Premiere and Resolve: the machine name (`os.hostname()` through CEP's Node or Electron) when available, else `Premiere on Mac`, `Premiere on Windows`, `Resolve on Mac`, `Resolve on Windows` from `HostInfo.os`.
- Web: `Web on <browser>` (for example `Web on Chrome`); there is no machine name.

`host` is the `HostKind` of the shell. Renaming later is not supported; the name is only sent at Activation.

### Public key

Run `pnpm keypair` in `apps/api`. The private JWK is a Worker secret. Put the public JWK (`{"kty":"OKP","crv":"Ed25519","x":"..."}`) in a source file of each Host shell, not fetched at runtime: a fetched key could be swapped. Only `kty`, `crv` and `x` are read, so a JWK with Node's `alg: "Ed25519"` is fine. Key rotation means shipping both public keys in a Host update and trying each; that is not built yet.

### Statuses

| `status()` | Meaning                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `unknown`  | No token stored: never activated here, or deactivated.                                         |
| `active`   | Stored token verifies against the public key, belongs to this Device id and has not expired.   |
| `expired`  | Token verifies but `exp` has passed (10 years today). Activate again.                          |
| `inactive` | A token is stored but does not verify: tampered, signed by another key, or for another Device. |

`status()` never touches the network. Everything after Activation works offline; the Host only goes online for `activate`, `deactivate`, and `checkForUpdate`. There is no grace period or periodic re-check: a valid token is valid until `exp`. A refunded Key keeps working offline until its token expires (see the API spike's open question on refunds).

`activate` resolves with the API's `ActivationResult` (`activated`, `device-limit` with the Devices holding the slots, `invalid-key`) and stores the token only on `activated`, after verifying it for this Device. It rejects with `ActivationNetworkError` when the server cannot be reached or answers something that is not an `ActivationResult`, and with `ActivationTokenError` if the server returns a token that does not verify. The UI shows "check your connection" for the first.

`deactivate()` asks the API to free this Device's slot (best effort) and always removes the local token. It resolves `{ released }`; when `released` is false (offline) the buyer can free the slot on the Device page.

### Updates

```ts
const update = await checkForUpdate({ apiBaseUrl, host: "premiere", currentVersion: "0.1.0" });
if (update) showUpdateBanner(update.latest, update.url, update.notes);
```

Resolves `null` when up to date, ahead, offline or on any error; it never throws. Versions are compared as semver without a dependency (pre-releases rank below their release, build metadata is ignored). Downloading from `update.url` is Key-gated: the Host appends `?key=` using `formatKey(payload.key.id)` from the stored token's payload (or asks the buyer to type it).

## Ed25519 in every runtime

`verifyActivationToken` tries WebCrypto Ed25519 first (Node 22, workerd, Safari 17+, Firefox 130+, Chrome 137+, Electron with a recent Chromium). When the runtime has no Ed25519 (`NotSupportedError`, or no `crypto.subtle`), it remembers that and verifies with `@noble/ed25519` (SHA-512 from `@noble/hashes`, wired through `etc.sha512Sync`). That covers Premiere's CEP Chromium 88 to 99. The signature is the same either way; the fallback adds about 15 KB minified, 7 KB gzipped, to a Host bundle. Signing is server only and always WebCrypto.

Tests force the fallback with `verifyActivationToken(token, jwk, now, { ed25519: "noble" })`, check it against RFC 8032 test vector 1, and simulate a runtime whose `importKey` throws `NotSupportedError`. The fallback has not run in a real CEP panel: that can only be checked with Premiere installed, by activating once in the panel and confirming `status()` is `active` after a restart.
