import { ActivationResult, type ActivationRequest, type HostKind } from "@icg/shared";
import { formatKey, parseKey } from "./key";
import { verifyActivationToken, type VerifyOptions } from "./token";

export interface LicenseStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

export type ActivationStatus = "unknown" | "active" | "inactive" | "expired";

export interface ActivationClientOptions {
  apiBaseUrl: string;
  publicKeyJwk: JsonWebKey;
  storage: LicenseStorage;
  device: { name: string; host: HostKind };
  fetch?: typeof fetch;
  verify?: VerifyOptions;
}

export interface ActivationClient {
  activate(key: string): Promise<ActivationResult>;
  status(): Promise<ActivationStatus>;
  deactivate(): Promise<{ released: boolean }>;
  getDevice(): ActivationRequest["device"];
}

export class ActivationNetworkError extends Error {
  override name = "ActivationNetworkError";
}

export class ActivationTokenError extends Error {
  override name = "ActivationTokenError";
}

export const DEVICE_ID_STORAGE_NAME = "icg.device-id";
export const TOKEN_STORAGE_NAME = "icg.activation-token";

export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createActivationClient(options: ActivationClientOptions): ActivationClient {
  const { storage, publicKeyJwk } = options;
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((...args) => globalThis.fetch(...args));

  function deviceId(): string {
    const stored = storage.getItem(DEVICE_ID_STORAGE_NAME);
    if (stored) return stored;
    const id = randomUuid();
    storage.setItem(DEVICE_ID_STORAGE_NAME, id);
    return id;
  }

  function getDevice(): ActivationRequest["device"] {
    return { id: deviceId(), name: options.device.name, host: options.device.host };
  }

  async function activate(input: string): Promise<ActivationResult> {
    const id = await parseKey(input);
    if (!id) return { status: "invalid-key" };
    const device = getDevice();
    const request: ActivationRequest = { key: await formatKey(id), device };

    let result: ActivationResult;
    try {
      const response = await doFetch(`${baseUrl}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const parsed = ActivationResult.safeParse(await response.json());
      if (!parsed.success) {
        throw new ActivationNetworkError(`Unexpected response (HTTP ${response.status})`);
      }
      result = parsed.data;
    } catch (error) {
      if (error instanceof ActivationNetworkError) throw error;
      throw new ActivationNetworkError("Could not reach the activation server", { cause: error });
    }

    if (result.status === "activated") {
      const verified = await verifyActivationToken(
        result.token,
        publicKeyJwk,
        undefined,
        options.verify,
      );
      if (!verified.ok || verified.payload.device !== device.id) {
        throw new ActivationTokenError("The server returned a token that does not verify");
      }
      storage.setItem(TOKEN_STORAGE_NAME, result.token);
    }
    return result;
  }

  async function status(): Promise<ActivationStatus> {
    const token = storage.getItem(TOKEN_STORAGE_NAME);
    if (!token) return "unknown";
    const verified = await verifyActivationToken(token, publicKeyJwk, undefined, options.verify);
    if (!verified.ok) return verified.reason === "expired" ? "expired" : "inactive";
    return verified.payload.device === deviceId() ? "active" : "inactive";
  }

  async function deactivate(): Promise<{ released: boolean }> {
    const token = storage.getItem(TOKEN_STORAGE_NAME);
    let released = false;
    if (token) {
      const verified = await verifyActivationToken(token, publicKeyJwk, 0, options.verify);
      if (verified.ok) {
        try {
          const key = await formatKey(verified.payload.key.id);
          const response = await doFetch(
            `${baseUrl}/devices/${encodeURIComponent(verified.payload.device)}?key=${encodeURIComponent(key)}`,
            { method: "DELETE" },
          );
          released = response.ok;
        } catch {
          released = false;
        }
      }
    }
    storage.removeItem(TOKEN_STORAGE_NAME);
    return { released };
  }

  return { activate, status, deactivate, getDevice };
}
