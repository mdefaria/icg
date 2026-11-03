import { FakeHostAdapter } from "@icg/host-sdk";
import {
  FontSet,
  createAvatarLoader,
  createEmojiLoader,
  initRenderer,
  renderOverlay,
  type FontFace,
  type FontFamily,
  type FontWeight,
  type RenderAssets,
} from "@icg/renderer";
import type { Avatar, OverlaySpec, SequenceInfo, Theme } from "@icg/shared";
import wasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  IcgPanel,
  UpdateBanner,
  createLocalStorageSettings,
  type PanelAssets,
  type UpdateInfo,
} from "../src";
import { FakeActivationClient, FakeEngine } from "../src/fakes";

const glob = (files: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(files).map(([path, value]) => [path.split("/").pop()!, value as string]),
  );

const fontUrls = glob(
  import.meta.glob("../../renderer/fonts/*.ttf", { query: "?url", import: "default", eager: true }),
);
const avatarUrls = glob(
  import.meta.glob("../../renderer/fixtures/avatars/*.png", {
    query: "?url",
    import: "default",
    eager: true,
  }),
);
const noto = glob(
  import.meta.glob("../../renderer/fixtures/emoji/noto/*.svg", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
const twemoji = glob(
  import.meta.glob("../../renderer/fixtures/emoji/twemoji/*.svg", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

const WEIGHTS: Record<string, FontWeight> = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700 };

async function bytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function loadAssets(): Promise<RenderAssets> {
  await initRenderer(fetch(wasmUrl));
  const faces: FontFace[] = await Promise.all(
    Object.entries(fontUrls).map(async ([file, url]) => {
      const [family, style] = file.replace(".ttf", "").split("-") as [FontFamily, string];
      return { family, weight: WEIGHTS[style] ?? 400, data: await bytes(url) };
    }),
  );
  const avatars: Record<string, Uint8Array> = {};
  for (const [file, url] of Object.entries(avatarUrls)) {
    avatars[file.replace(".png", "")] = await bytes(url);
  }
  return {
    fonts: new FontSet(faces),
    emoji: createEmojiLoader({ noto, twemoji }),
    avatars: createAvatarLoader(avatars),
  };
}

const AVATAR_IDS = Object.keys(avatarUrls).map((file) => file.replace(".png", ""));

const panelAssets: PanelAssets = {
  silhouettes: [
    { kind: "default" },
    { kind: "default", letter: "A" },
    { kind: "default", letter: "M" },
    { kind: "default", letter: "S" },
  ],
  avatarSrc(avatar: Avatar) {
    if (avatar.kind === "user") return avatar.dataUrl;
    if (avatar.kind === "pool") return avatarUrls[`${avatar.id}.png`];
    return undefined;
  },
};

const SEQUENCES: Record<string, SequenceInfo | null> = {
  vertical: { name: "Sequence 01", width: 1080, height: 1920, frameRate: 30 },
  landscape: { name: "Wide 01", width: 1920, height: 1080, frameRate: 25 },
  none: null,
};

const UPDATE: UpdateInfo = {
  latest: "1.1.0",
  url: "https://example.com/changelog",
  notes: "New Bank entries for Spanish and an X Template refresh.",
};

const params = new URLSearchParams(location.search);

function Harness({ assets }: { assets: RenderAssets }) {
  const [theme, setTheme] = useState<Theme>(params.get("theme") === "light" ? "light" : "dark");
  const [width, setWidth] = useState(Number(params.get("width") ?? 360));
  const [canInsert, setCanInsert] = useState(params.get("canInsert") !== "false");
  const [sequenceKey, setSequenceKey] = useState(params.get("sequence") ?? "vertical");
  const [showUpdate, setShowUpdate] = useState(params.get("update") === "true");

  const host = useMemo(
    () =>
      new FakeHostAdapter({
        canInsert,
        sequence: SEQUENCES[sequenceKey] ?? null,
        theme,
        playheadSeconds: 12,
      }),
    [canInsert, sequenceKey],
  );
  useEffect(() => host.setTheme(theme), [host, theme]);

  const engine = useMemo(() => new FakeEngine({ seed: "harness", avatarIds: AVATAR_IDS }), []);
  const activation = useMemo(() => new FakeActivationClient({ delayMs: 300 }), []);
  const settings = useMemo(() => createLocalStorageSettings(localStorage, "icg.harness."), []);
  const render = useMemo(() => (spec: OverlaySpec) => renderOverlay(spec, assets), [assets]);

  return (
    <div>
      <div className="harness-controls" style={controlsStyle}>
        <style>{".harness-controls label { margin-right: 14px; }"}</style>
        <label>
          <input
            type="checkbox"
            checked={theme === "light"}
            onChange={(e) => setTheme(e.target.checked ? "light" : "dark")}
          />{" "}
          Light Host theme
        </label>
        <label>
          Width {width}px{" "}
          <input
            type="range"
            min={320}
            max={640}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={canInsert}
            onChange={(e) => setCanInsert(e.target.checked)}
          />{" "}
          Host can Insert
        </label>
        <label>
          Sequence{" "}
          <select value={sequenceKey} onChange={(e) => setSequenceKey(e.target.value)}>
            <option value="vertical">1080×1920</option>
            <option value="landscape">1920×1080</option>
            <option value="none">none</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={showUpdate}
            onChange={(e) => setShowUpdate(e.target.checked)}
          />{" "}
          Update banner
        </label>
      </div>
      <div id="panel" style={{ width, minHeight: 640, display: "flex" }}>
        <IcgPanel
          key={`${canInsert}-${sequenceKey}`}
          engine={engine}
          host={host}
          render={render}
          settings={settings}
          assets={panelAssets}
          activation={activation}
          banner={
            <UpdateBanner
              info={showUpdate ? UPDATE : null}
              onOpen={(url) => host.openExternal(url)}
            />
          }
        />
      </div>
    </div>
  );
}

const controlsStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  padding: "8px",
  color: "#fff",
  background: "#3b3d42",
} as const;

const root = createRoot(document.getElementById("root")!);
loadAssets().then(
  (assets) =>
    root.render(
      <StrictMode>
        <Harness assets={assets} />
      </StrictMode>,
    ),
  (error: unknown) => root.render(<pre style={{ color: "white" }}>{String(error)}</pre>),
);
