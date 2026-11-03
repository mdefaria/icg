import { z } from "zod";

export const HostKind = z.enum(["premiere", "resolve", "web"]);
export type HostKind = z.infer<typeof HostKind>;

export const HostInfo = z.object({
  kind: HostKind,
  version: z.string(),
  os: z.enum(["mac", "win", "other"]),
});
export type HostInfo = z.infer<typeof HostInfo>;

export const SequenceInfo = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: z.number().positive(),
});
export type SequenceInfo = z.infer<typeof SequenceInfo>;
