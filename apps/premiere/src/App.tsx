import type { Overlay, SequenceInfo, Theme } from "@icg/shared";
import { DEFAULT_INSERT_OPTIONS, type HostAdapter, type InsertResult } from "@icg/host-sdk";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { BinaryLoader } from "./cep/assets";
import { overlayFileName, type OverlayFileWriter } from "./cep/files";
import { loadRenderAssets } from "./panelAssets";
import { renderOverlay } from "./render/renderOverlay";
import { sampleSpec } from "./render/sample";
import type { PingResult } from "./adapter/schemas";

export type AppProps = {
  host: HostAdapter;
  files: OverlayFileWriter | null;
  loader: BinaryLoader;
  ping: (() => Promise<PingResult>) | null;
};

const DOCS_URL = "https://github.com/Adobe-CEP/CEP-Resources";

export function App({ host, files, loader, ping }: AppProps) {
  const [theme, setTheme] = useState<Theme>(() => host.getTheme());
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [sequence, setSequence] = useState<SequenceInfo | null | "unknown">("unknown");
  const [jsxStatus, setJsxStatus] = useState<string>(
    ping ? "checking icg.jsx" : "no ExtendScript bridge",
  );
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const append = useCallback((line: string) => setLog((prev) => [...prev.slice(-19), line]), []);

  useEffect(() => host.onThemeChange(setTheme), [host]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const started = performance.now();
        const assets = await loadRenderAssets(loader);
        const rendered = renderOverlay(sampleSpec, assets);
        if (cancelled) return;
        setRenderMs(Math.round(performance.now() - started));
        setOverlay(rendered);
        append(
          `rendered ${rendered.frame.width}x${rendered.frame.height} PNG (${rendered.png.byteLength} bytes)`,
        );
      } catch (error) {
        append(`render failed: ${String(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loader, append]);

  useEffect(() => {
    if (!overlay) return;
    const url = URL.createObjectURL(new Blob([overlay.png as BlobPart], { type: "image/png" }));
    setPngUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [overlay]);

  const refreshSequence = useCallback(async () => {
    try {
      setSequence(await host.getSequenceInfo());
    } catch (error) {
      append(`getSequenceInfo failed: ${String(error)}`);
    }
  }, [host, append]);

  useEffect(() => {
    void refreshSequence();
    if (!ping) return;
    ping()
      .then((result) =>
        setJsxStatus(`icg.jsx ok, Premiere ${result.version}, QE ${result.qe ? "on" : "off"}`),
      )
      .catch((error: unknown) => setJsxStatus(`icg.jsx unreachable: ${String(error)}`));
  }, [ping, refreshSequence]);

  const insert = useCallback(async () => {
    if (!overlay) return;
    setBusy(true);
    try {
      const result: InsertResult = await host.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS);
      append(`insert: ${JSON.stringify(result)}`);
      void refreshSequence();
    } finally {
      setBusy(false);
    }
  }, [host, overlay, append, refreshSequence]);

  const saveToTemp = useCallback(async () => {
    if (!overlay || !files) return;
    setBusy(true);
    try {
      const path = await files.writePng(overlay.png, overlayFileName());
      append(`wrote ${path}`);
    } catch (error) {
      append(`write failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [overlay, files, append]);

  const styles = useMemo(() => stylesFor(theme), [theme]);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <strong>ICG</strong>
        <span style={styles.muted}>
          {host.info.kind} {host.info.version} · {host.info.os} · {theme}
        </span>
      </div>

      <div style={styles.section}>
        <div style={styles.muted}>{jsxStatus}</div>
        <div>
          {sequence === "unknown"
            ? "Sequence: reading"
            : sequence
              ? `Sequence: ${sequence.name} · ${sequence.width}x${sequence.height} @ ${sequence.frameRate}`
              : "Sequence: none active"}
        </div>
      </div>

      <div style={styles.preview}>
        {pngUrl ? (
          <img src={pngUrl} alt="Overlay preview" style={styles.image} />
        ) : (
          <span style={styles.muted}>Rendering Overlay</span>
        )}
      </div>
      {renderMs !== null && (
        <div style={styles.muted}>Rendered in {renderMs} ms with resvg-wasm</div>
      )}

      <div style={styles.row}>
        <button style={styles.button} disabled={!overlay || busy} onClick={() => void insert()}>
          Insert at playhead
        </button>
        <button
          style={styles.button}
          disabled={!overlay || busy || !files}
          onClick={() => void saveToTemp()}
        >
          Write PNG to temp
        </button>
        <button style={styles.button} onClick={() => void refreshSequence()}>
          Refresh
        </button>
        <button style={styles.button} onClick={() => host.openExternal(DOCS_URL)}>
          Open CEP docs
        </button>
      </div>

      <pre style={styles.log}>{log.join("\n")}</pre>
    </div>
  );
}

function stylesFor(theme: Theme): Record<string, CSSProperties> {
  const dark = theme === "dark";
  const fg = dark ? "#e6e6e6" : "#1f1f1f";
  const bg = dark ? "#232323" : "#f5f5f5";
  const border = dark ? "#3a3a3a" : "#d0d0d0";
  return {
    root: {
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      boxSizing: "border-box",
      padding: 12,
      gap: 10,
      color: fg,
      background: bg,
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: 12,
    },
    header: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
    muted: { color: dark ? "#9a9a9a" : "#666" },
    section: { display: "flex", flexDirection: "column", gap: 4 },
    preview: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      minHeight: 160,
      border: `1px solid ${border}`,
      backgroundImage:
        "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
      backgroundSize: "16px 16px",
      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
      overflow: "hidden",
    },
    image: { maxWidth: "100%", maxHeight: "100%" },
    row: { display: "flex", flexWrap: "wrap", gap: 6 },
    button: {
      padding: "6px 10px",
      border: `1px solid ${border}`,
      background: dark ? "#2f2f2f" : "#fff",
      color: fg,
      cursor: "pointer",
    },
    log: {
      margin: 0,
      padding: 8,
      maxHeight: 140,
      overflow: "auto",
      border: `1px solid ${border}`,
      fontSize: 11,
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
    },
  };
}
