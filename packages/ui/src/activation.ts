import type { ActivationResult } from "@icg/shared";

export type ActivationStatus = "unknown" | "active" | "inactive";

export interface ActivationClient {
  activate(key: string): Promise<ActivationResult>;
  status(): ActivationStatus;
}
