import { Platform } from "@icg/shared";
import { z } from "zod";

/** Share of the finished pool per category. Mirrors COMPOSITION in common.py. */
export const POOL_COMPOSITION = {
  face: 0.6,
  pet: 0.05,
  car: 0.03,
  anime: 0.04,
  landscape: 0.035,
  "selfie-back": 0.03,
  food: 0.03,
  gym: 0.035,
  default: 0.15,
} as const;

export const PoolCategory = z.enum([
  "face",
  "pet",
  "car",
  "anime",
  "landscape",
  "selfie-back",
  "food",
  "gym",
  "default",
]);
export type PoolCategory = z.infer<typeof PoolCategory>;

/** Coarse, non-identifying. Boundaries: <30, <45, <60, 60+. */
export const AgeBucket = z.enum(["young-adult", "adult", "middle-aged", "senior"]);
export type AgeBucket = z.infer<typeof AgeBucket>;

export const Presentation = z.enum(["masculine", "feminine"]);
export type Presentation = z.infer<typeof Presentation>;

export const PoolEntry = z.object({
  /** Short content hash; also the `Avatar.id` for `{ kind: "pool" }`. */
  id: z.string().regex(/^[a-f0-9]{8,16}$/),
  /** File name relative to index.json. */
  file: z.string().min(1),
  category: PoolCategory,
  /** Category plus coarse descriptors such as `non-face`, `silhouette`, `letter`, `age:adult`. */
  tags: z.array(z.string()),
  /** Only on Platform defaults. Faces and non-face Avatars suit every Platform. */
  platform: Platform.optional(),
  /** Only on letter avatars. */
  letter: z.string().length(1).optional(),
  ageBucket: AgeBucket.optional(),
  presentation: Presentation.optional(),
  bytes: z.number().int().nonnegative(),
});
export type PoolEntry = z.infer<typeof PoolEntry>;

export const PoolIndex = z.object({
  version: z.literal(1),
  /** Pixel size of every image (square). */
  size: z.number().int().positive(),
  format: z.literal("webp"),
  generatedAt: z.string().optional(),
  entries: z.array(PoolEntry),
});
export type PoolIndex = z.infer<typeof PoolIndex>;
