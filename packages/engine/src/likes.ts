import type { Comment, Platform } from "@icg/shared";
import type { Rng } from "./engine";

const ALPHA = 0.6;
const CAP = 2_500_000;

function pareto(rng: Rng, scale: number): number {
  const u = 1 - rng();
  return Math.min(CAP, Math.floor(scale * Math.pow(u, -1 / ALPHA) - scale));
}

export function sampleLikes(rng: Rng, flags: { pinned: boolean; likedByCreator: boolean }): number {
  const scale = flags.pinned ? 40 : flags.likedByCreator ? 12 : 3;
  return pareto(rng, scale);
}

export function sampleReplyLikes(rng: Rng, commentLikes: number): number {
  return Math.floor(commentLikes * (0.05 + rng() * 0.5) + rng() * Math.min(6, commentLikes + 2));
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

export type Counts = Pick<Comment, "replies" | "reposts" | "views">;

export function sampleCounts(rng: Rng, platform: Platform, likes: number): Counts {
  if (platform === "x") {
    return {
      replies: Math.round(likes * between(rng, 0.02, 0.12)),
      reposts: Math.round(likes * between(rng, 0.03, 0.2)),
      views: Math.round(likes * between(rng, 25, 70) + between(rng, 40, 1500)),
    };
  }
  if (platform === "youtube") return { replies: Math.round(likes * between(rng, 0, 0.08)) };
  return {};
}

export function withCounts(comment: Comment, counts: Counts): Comment {
  const rest: Comment = { ...comment };
  delete rest.replies;
  delete rest.reposts;
  delete rest.views;
  return { ...rest, ...counts };
}
