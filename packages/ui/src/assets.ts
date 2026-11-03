import type { Avatar } from "@icg/shared";

export type PanelAssets = {
  silhouettes: Avatar[];
  avatarSrc(avatar: Avatar): string | undefined;
};

export const NO_ASSETS: PanelAssets = {
  silhouettes: [{ kind: "default" }],
  avatarSrc: (avatar) => (avatar.kind === "user" ? avatar.dataUrl : undefined),
};
