import type { Engine, GenerateOptions } from "@icg/engine";
import type { HostAdapter } from "@icg/host-sdk";
import { FRAME_PRESETS, SequenceInfo, type Theme } from "@icg/shared";
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { ActivationClient, ActivationStatus } from "./activation";
import { NO_ASSETS, type PanelAssets } from "./assets";
import { createCardImages, type RenderOverlay } from "./cards";
import { EMPTY_COMMENTS, commentsReducer } from "./comments";
import { PanelContext, type Panel, type Screen, type SequenceState } from "./context";
import css from "./panel.module.css";
import { ActivationScreen } from "./screens/ActivationScreen";
import { EditScreen } from "./screens/EditScreen";
import { GenerateScreen } from "./screens/GenerateScreen";
import { InsertScreen } from "./screens/InsertScreen";
import { PlacementScreen } from "./screens/PlacementScreen";
import { useSetting, type SettingsStore } from "./settings";

export type IcgPanelProps = {
  engine: Engine;
  host: HostAdapter;
  render: RenderOverlay;
  settings: SettingsStore;
  assets?: PanelAssets;
  activation?: ActivationClient;
  banner?: ReactNode;
};

const TABS: { screen: Screen; label: string }[] = [
  { screen: "generate", label: "Generate" },
  { screen: "edit", label: "Edit" },
  { screen: "placement", label: "Placement" },
  { screen: "insert", label: "Insert" },
];

export function IcgPanel({
  engine,
  host,
  render,
  settings,
  assets = NO_ASSETS,
  activation,
  banner,
}: IcgPanelProps) {
  const theme = useHostTheme(host);
  const [screen, setScreen] = useState<Screen>("generate");
  const [state, dispatch] = useReducer(commentsReducer, EMPTY_COMMENTS);
  const [generate] = useSetting(settings, "generate");
  const [creator] = useSetting(settings, "creator");
  const [framePreset] = useSetting(settings, "frame");
  const cards = useMemo(() => createCardImages(render), [render]);
  const { sequence, refresh } = useSequence(host);
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>(
    () => activation?.status() ?? "unknown",
  );

  const goTo = useCallback(
    (next: Screen) => {
      setScreen(next);
      if (next === "placement" || next === "insert") refresh();
      if (next !== "activation" && activation) setActivationStatus(activation.status());
    },
    [refresh, activation],
  );

  const panel = useMemo<Panel>(() => {
    const options: GenerateOptions = {
      platform: generate.platform,
      language: generate.language,
      variant: generate.variant,
      creator,
      ...(generate.tones.length > 0 ? { tones: generate.tones } : {}),
      ...(generate.context ? { contexts: [generate.context] } : {}),
    };
    const seq = sequence.status === "ready" ? sequence.sequence : null;
    return {
      engine,
      host,
      render,
      cards,
      assets,
      settings,
      state,
      dispatch,
      generate,
      options,
      template: { platform: generate.platform, theme: generate.theme, variant: generate.variant },
      language: generate.language,
      frame: seq ? { width: seq.width, height: seq.height } : FRAME_PRESETS[framePreset],
      sequence,
      goTo,
    };
  }, [
    engine,
    host,
    render,
    cards,
    assets,
    settings,
    state,
    generate,
    creator,
    framePreset,
    sequence,
    goTo,
  ]);

  return (
    <PanelContext.Provider value={panel}>
      <div className={`${css.root} ${css[theme]}`} data-theme={theme} data-testid="icg-panel">
        {banner ? <div className={css.banner}>{banner}</div> : null}
        {screen === "activation" ? null : (
          <nav className={css.tabs} role="tablist" aria-label="ICG">
            {TABS.map((tab) => (
              <button
                key={tab.screen}
                type="button"
                role="tab"
                aria-selected={screen === tab.screen}
                className={`${css.tab} ${screen === tab.screen ? css.tabActive : ""}`}
                onClick={() => goTo(tab.screen)}
              >
                {tab.label}
                {tab.screen === "generate" && state.comments.length > 0 ? (
                  <span className={css.badge}>{state.comments.length}</span>
                ) : null}
              </button>
            ))}
          </nav>
        )}
        <main className={css.body} role="tabpanel" aria-label={screen}>
          {screen === "generate" ? <GenerateScreen /> : null}
          {screen === "edit" ? <EditScreen /> : null}
          {screen === "placement" ? <PlacementScreen /> : null}
          {screen === "insert" ? <InsertScreen /> : null}
          {screen === "activation" && activation ? (
            <ActivationScreen
              client={activation}
              onDone={() => goTo("generate")}
              onStatus={setActivationStatus}
            />
          ) : null}
        </main>
        {activation && screen !== "activation" ? (
          <footer className={css.footer}>
            <span>{activationStatus === "active" ? "Activated" : "Not activated"}</span>
            <button type="button" className={css.linkButton} onClick={() => goTo("activation")}>
              {activationStatus === "active" ? "Activation" : "Enter Key"}
            </button>
          </footer>
        ) : null}
      </div>
    </PanelContext.Provider>
  );
}

function useHostTheme(host: HostAdapter): Theme {
  const [theme, setTheme] = useState<Theme>(() => host.getTheme());
  useEffect(() => {
    setTheme(host.getTheme());
    return host.onThemeChange(setTheme);
  }, [host]);
  return theme;
}

function useSequence(host: HostAdapter): { sequence: SequenceState; refresh: () => void } {
  const [sequence, setSequence] = useState<SequenceState>({ status: "loading" });
  const refresh = useCallback(() => {
    host.getSequenceInfo().then(
      (raw) => {
        const parsed = SequenceInfo.nullable().safeParse(raw);
        setSequence({ status: "ready", sequence: parsed.success ? parsed.data : null });
      },
      () => setSequence({ status: "ready", sequence: null }),
    );
  }, [host]);
  useEffect(refresh, [refresh]);
  return { sequence, refresh };
}
