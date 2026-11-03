import { HostInfo, SequenceInfo } from "@icg/shared";
import { z } from "zod";

export { CHANNELS } from "./channels";

export const HostStatus = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("ready"),
    info: HostInfo,
    productName: z.string(),
    isStudio: z.boolean(),
    modulePath: z.string(),
    moduleVersion: z.string().nullable(),
  }),
  z.object({ state: z.literal("module-missing"), info: HostInfo, triedPaths: z.array(z.string()) }),
  z.object({
    state: z.literal("module-failed"),
    info: HostInfo,
    modulePath: z.string(),
    message: z.string(),
  }),
  z.object({
    state: z.literal("init-failed"),
    info: HostInfo,
    modulePath: z.string(),
    message: z.string(),
  }),
]);
export type HostStatus = z.infer<typeof HostStatus>;

export const SequenceInfoResult = SequenceInfo.nullable();

export const InsertRequest = z.object({
  png: z.instanceof(Uint8Array),
  durationSeconds: z.number().positive(),
  label: z.string().min(1),
});
export type InsertRequest = z.infer<typeof InsertRequest>;

export const InsertResultMessage = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("inserted"),
    track: z.number().int().positive(),
    startSeconds: z.number().nonnegative(),
    recordFrame: z.number().int(),
    durationFrames: z.number().int().positive(),
    filePath: z.string(),
  }),
  z.object({ status: z.literal("no-sequence") }),
  z.object({ status: z.literal("failed"), reason: z.string() }),
]);
export type InsertResultMessage = z.infer<typeof InsertResultMessage>;

export const WriteTempFileRequest = z.object({
  png: z.instanceof(Uint8Array),
  label: z.string().min(1),
});
export type WriteTempFileRequest = z.infer<typeof WriteTempFileRequest>;

export const WriteTempFileResult = z.object({ path: z.string() });

export const ReadAssetRequest = z.object({ url: z.string().url() });

export const ReadAssetResult = z.instanceof(Uint8Array);

export const OpenExternalRequest = z.object({ url: z.string().url() });
