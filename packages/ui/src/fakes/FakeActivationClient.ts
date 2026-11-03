import type { ActivationResult, Device } from "@icg/shared";
import type { ActivationClient, ActivationStatus } from "../activation";

export type FakeActivationOptions = {
  status?: ActivationStatus;
  validKeys?: string[];
  devices?: Device[];
  delayMs?: number;
};

export class FakeActivationClient implements ActivationClient {
  readonly attempts: string[] = [];
  private current: ActivationStatus;
  private readonly validKeys: Set<string>;
  private readonly devices: Device[];
  private readonly delayMs: number;

  constructor(options: FakeActivationOptions = {}) {
    this.current = options.status ?? "inactive";
    this.validKeys = new Set(options.validKeys ?? ["ICG-TEST-KEY"]);
    this.devices = options.devices ?? [];
    this.delayMs = options.delayMs ?? 0;
  }

  status(): ActivationStatus {
    return this.current;
  }

  async activate(key: string): Promise<ActivationResult> {
    this.attempts.push(key);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (!this.validKeys.has(key)) return { status: "invalid-key" };
    if (this.devices.length >= 3) return { status: "device-limit", devices: this.devices };
    this.current = "active";
    return { status: "activated", token: `fake-token-${this.attempts.length}` };
  }
}
