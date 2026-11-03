import { z } from "zod";
import { Comment } from "./comment";
import { Language, Template } from "./platform";

export const Frame = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Frame = z.infer<typeof Frame>;

export const FRAME_PRESETS = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
} as const satisfies Record<string, Frame>;
export type FramePreset = keyof typeof FRAME_PRESETS;

export const Placement = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().positive(),
});
export type Placement = z.infer<typeof Placement>;

export const DEFAULT_PLACEMENT: Placement = { x: 0.5, y: 0.7, scale: 1 };

export const OverlaySpec = z.object({
  comment: Comment,
  template: Template,
  frame: Frame,
  placement: Placement,
  language: Language.optional(),
});
export type OverlaySpec = z.infer<typeof OverlaySpec>;

export type Overlay = {
  png: Uint8Array;
  frame: Frame;
  spec: OverlaySpec;
};
