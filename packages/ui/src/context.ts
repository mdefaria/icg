import type { Engine, GenerateOptions } from "@icg/engine";
import type { HostAdapter } from "@icg/host-sdk";
import type { Frame, Language, SequenceInfo, Template } from "@icg/shared";
import { createContext, useContext, type Dispatch } from "react";
import type { PanelAssets } from "./assets";
import type { CardImages, RenderOverlay } from "./cards";
import type { CommentsAction, CommentsState } from "./comments";
import type { GenerateSettings, SettingsStore } from "./settings";

export type SequenceState =
  { status: "loading" } | { status: "ready"; sequence: SequenceInfo | null };

export type Panel = {
  engine: Engine;
  host: HostAdapter;
  render: RenderOverlay;
  cards: CardImages;
  assets: PanelAssets;
  settings: SettingsStore;
  state: CommentsState;
  dispatch: Dispatch<CommentsAction>;
  generate: GenerateSettings;
  options: GenerateOptions;
  template: Template;
  language: Language;
  frame: Frame;
  sequence: SequenceState;
  goTo: (screen: Screen) => void;
};

export type Screen = "generate" | "edit" | "placement" | "insert" | "activation";

export const PanelContext = createContext<Panel | null>(null);

export function usePanel(): Panel {
  const panel = useContext(PanelContext);
  if (!panel) throw new Error("usePanel must be used inside <IcgPanel>");
  return panel;
}
