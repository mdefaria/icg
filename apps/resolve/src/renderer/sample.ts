import { DEFAULT_PLACEMENT, FRAME_PRESETS, OverlaySpec } from "@icg/shared";

export const SAMPLE_SPEC: OverlaySpec = OverlaySpec.parse({
  comment: {
    id: "spike-s4-1",
    origin: "generated",
    author: {
      username: "mara.cuts",
      displayName: "mara.cuts",
      avatar: { kind: "default", letter: "M" },
      verified: true,
    },
    text: "the transition at 0:14 is actually insane, how long did that take you",
    likes: 2419,
    timeAgo: "3h",
    pinned: false,
    likedByCreator: true,
  },
  template: { platform: "tiktok", theme: "dark", variant: "single" },
  frame: FRAME_PRESETS["9:16"],
  placement: DEFAULT_PLACEMENT,
});
