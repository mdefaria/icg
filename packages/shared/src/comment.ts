import { z } from "zod";

export const Avatar = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pool"), id: z.string().min(1) }),
  z.object({ kind: z.literal("user"), dataUrl: z.string().startsWith("data:image/") }),
  z.object({ kind: z.literal("default"), letter: z.string().length(1).optional() }),
]);
export type Avatar = z.infer<typeof Avatar>;

export const Author = z.object({
  username: z.string().min(1),
  displayName: z.string(),
  avatar: Avatar,
  verified: z.boolean(),
});
export type Author = z.infer<typeof Author>;

export const Reply = z.object({
  author: Author,
  text: z.string(),
  likes: z.number().int().nonnegative(),
  timeAgo: z.string().min(1),
});
export type Reply = z.infer<typeof Reply>;

export const Comment = z.object({
  id: z.string().min(1),
  origin: z.enum(["generated", "manual"]),
  author: Author,
  text: z.string(),
  likes: z.number().int().nonnegative(),
  timeAgo: z.string().min(1),
  pinned: z.boolean(),
  likedByCreator: z.boolean(),
  reply: Reply.optional(),
});
export type Comment = z.infer<typeof Comment>;
