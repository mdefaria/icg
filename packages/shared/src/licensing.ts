import { z } from "zod";

export const KEY_VERSION = 1;
export const DEVICES_PER_KEY = 3;

export const KeyPayload = z.object({
  v: z.literal(KEY_VERSION),
  id: z.string().min(1),
  issuedAt: z.number().int().positive(),
  devices: z.number().int().positive(),
});
export type KeyPayload = z.infer<typeof KeyPayload>;

export const Device = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  host: z.enum(["premiere", "resolve", "web"]),
  activatedAt: z.number().int().positive(),
});
export type Device = z.infer<typeof Device>;

export const ActivationRequest = z.object({
  key: z.string().min(1),
  device: Device.omit({ activatedAt: true }),
});
export type ActivationRequest = z.infer<typeof ActivationRequest>;

export const ActivationResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("activated"), token: z.string().min(1) }),
  z.object({ status: z.literal("device-limit"), devices: z.array(Device) }),
  z.object({ status: z.literal("invalid-key") }),
]);
export type ActivationResult = z.infer<typeof ActivationResult>;
