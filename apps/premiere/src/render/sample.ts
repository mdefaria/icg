import { DEFAULT_PLACEMENT, FRAME_PRESETS, type Comment, type OverlaySpec } from "@icg/shared";

export const sampleComment: Comment = {
  id: "sample-tiktok-dark",
  origin: "manual",
  author: {
    username: "mia.edits",
    displayName: "Mia",
    avatar: { kind: "default", letter: "M" },
    verified: true,
  },
  text: "the transition at 0:07 is actually insane, teach us 🔥",
  likes: 12400,
  timeAgo: "2h",
  pinned: false,
  likedByCreator: true,
};

export const sampleSpec: OverlaySpec = {
  comment: sampleComment,
  template: { platform: "tiktok", theme: "dark", variant: "single" },
  frame: FRAME_PRESETS["9:16"],
  placement: DEFAULT_PLACEMENT,
};
