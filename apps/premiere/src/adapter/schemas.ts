import { SequenceInfo } from "@icg/shared";
import { z } from "zod";

export const ClipRange = z.object({
  startSeconds: z.number(),
  endSeconds: z.number(),
});
export type ClipRange = z.infer<typeof ClipRange>;

export const TrackSnapshot = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().optional(),
  clips: z.array(ClipRange),
});
export type TrackSnapshot = z.infer<typeof TrackSnapshot>;

export const TimelineSnapshot = z.object({
  playheadSeconds: z.number().nonnegative(),
  tracks: z.array(TrackSnapshot),
});
export type TimelineSnapshot = z.infer<typeof TimelineSnapshot>;

export const SequenceInfoResult = SequenceInfo.nullable();
export const TimelineResult = TimelineSnapshot.nullable();

export const PingResult = z.object({ version: z.string(), qe: z.boolean() });
export type PingResult = z.infer<typeof PingResult>;

export const AddTrackResult = z.object({
  method: z.string(),
  numVideoTracks: z.number().int().positive(),
});

export const InsertArgs = z.object({
  path: z.string().min(1),
  trackIndex: z.number().int().nonnegative(),
  durationSeconds: z.number().positive(),
  label: z.string().min(1),
});
export type InsertArgs = z.infer<typeof InsertArgs>;

export const JsxInsertResult = z.object({
  trackIndex: z.number().int().nonnegative(),
  startSeconds: z.number(),
  endSeconds: z.number(),
  overwriteForm: z.string(),
  steps: z.array(z.string()),
});
export type JsxInsertResult = z.infer<typeof JsxInsertResult>;
