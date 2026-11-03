import { DEFAULT_INSERT_OPTIONS, FakeHostAdapter, type HostAdapter } from "@icg/host-sdk";
import type { Overlay, SequenceInfo } from "@icg/shared";
import { useEffect, useState, type ReactNode } from "react";
import type { HostStatus, InsertResultMessage } from "../ipc/contract";
import { getBridge } from "./bridge";
import { getRenderer, type AssetSource } from "./render";
import { ResolveHostAdapter } from "./resolve-host-adapter";
import { SAMPLE_SPEC } from "./sample";

type Connection =
  | { kind: "loading" }
  | { kind: "resolve"; status: HostStatus; adapter: ResolveHostAdapter }
  | { kind: "preview"; adapter: FakeHostAdapter }
  | { kind: "error"; message: string };

type Rendered = { overlay: Overlay; url: string; ms: number; assetSource: AssetSource };

const DOCS_URL = "https://github.com/rsms/inter";

export function App() {
  const [connection, setConnection] = useState<Connection>({ kind: "loading" });
  const [sequence, setSequence] = useState<SequenceInfo | null | "unknown">("unknown");
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [tempPath, setTempPath] = useState<string | null>(null);
  const [insertResult, setInsertResult] = useState<InsertResultMessage | string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      const adapter = new FakeHostAdapter({ info: { kind: "resolve", version: "preview" } });
      setConnection({ kind: "preview", adapter });
      return;
    }
    ResolveHostAdapter.connect(bridge)
      .then((result) => setConnection({ kind: "resolve", ...result }))
      .catch((error: unknown) => setConnection({ kind: "error", message: String(error) }));
  }, []);

  const adapter: HostAdapter | null =
    connection.kind === "resolve" || connection.kind === "preview" ? connection.adapter : null;

  async function refreshSequence() {
    if (!adapter) return;
    try {
      setSequence(await adapter.getSequenceInfo());
    } catch (error) {
      setSequence(null);
      setInsertResult(`getSequenceInfo failed: ${String(error)}`);
    }
  }

  useEffect(() => {
    void refreshSequence();
  }, [connection.kind]);

  async function render() {
    setBusy(true);
    setRenderError(null);
    try {
      const renderer = await getRenderer();
      const result = renderer.render(SAMPLE_SPEC);
      if (rendered) URL.revokeObjectURL(rendered.url);
      const blob = new Blob([result.overlay.png as BlobPart], { type: "image/png" });
      setRendered({
        overlay: result.overlay,
        url: URL.createObjectURL(blob),
        ms: result.ms,
        assetSource: renderer.assetSource,
      });
    } catch (error) {
      setRenderError(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function writeTemp() {
    if (!rendered || connection.kind !== "resolve") return;
    setBusy(true);
    try {
      setTempPath(
        await connection.adapter.writeTempFile(rendered.overlay, DEFAULT_INSERT_OPTIONS.label),
      );
    } catch (error) {
      setTempPath(`failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function insert() {
    if (!rendered || !adapter) return;
    setBusy(true);
    setInsertResult(null);
    try {
      if (connection.kind === "resolve") {
        setInsertResult(
          await connection.adapter.insertOverlayDetailed(rendered.overlay, DEFAULT_INSERT_OPTIONS),
        );
      } else {
        const result = await adapter.insertOverlay(rendered.overlay, DEFAULT_INSERT_OPTIONS);
        setInsertResult(JSON.stringify(result));
      }
      await refreshSequence();
    } catch (error) {
      setInsertResult(`failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>ICG for DaVinci Resolve Studio (spike S4)</h1>
      <StatusBanner connection={connection} />

      <h2>Sequence</h2>
      {sequence === "unknown" ? (
        <p className="muted">Reading the current timeline...</p>
      ) : sequence ? (
        <dl>
          <Field label="Timeline">{sequence.name}</Field>
          <Field label="Size">
            {sequence.width} x {sequence.height}
          </Field>
          <Field label="Frame rate">{sequence.frameRate}</Field>
        </dl>
      ) : (
        <p className="muted">No timeline is open.</p>
      )}
      <div className="row">
        <button onClick={() => void refreshSequence()} disabled={!adapter || busy}>
          Refresh
        </button>
      </div>

      <h2>Overlay</h2>
      <div className="row">
        <button className="primary" onClick={() => void render()} disabled={busy}>
          Render sample Comment (1080 x 1920)
        </button>
        <button
          onClick={() => void writeTemp()}
          disabled={!rendered || busy || connection.kind !== "resolve"}
        >
          Write temp PNG
        </button>
        <button onClick={() => void insert()} disabled={!rendered || busy || !adapter}>
          Insert at playhead ({DEFAULT_INSERT_OPTIONS.durationSeconds} s)
        </button>
      </div>
      {renderError && <pre>{renderError}</pre>}
      {rendered && (
        <div className="preview">
          <img src={rendered.url} alt="Rendered Overlay" />
          <dl>
            <Field label="Render time">{rendered.ms} ms</Field>
            <Field label="PNG size">{(rendered.overlay.png.byteLength / 1024).toFixed(0)} KB</Field>
            <Field label="Assets via">{rendered.assetSource}</Field>
          </dl>
        </div>
      )}
      {tempPath && (
        <>
          <h2>Temp file</h2>
          <pre>{tempPath}</pre>
        </>
      )}
      {insertResult && (
        <>
          <h2>Insert result</h2>
          <pre>
            {typeof insertResult === "string"
              ? insertResult
              : JSON.stringify(insertResult, null, 2)}
          </pre>
        </>
      )}

      <h2>Links</h2>
      <p>
        <a
          href={DOCS_URL}
          onClick={(event) => {
            event.preventDefault();
            adapter?.openExternal(DOCS_URL);
          }}
        >
          Open an external link (tests openExternal)
        </a>
      </p>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function StatusBanner({ connection }: { connection: Connection }) {
  if (connection.kind === "loading") return <div className="banner">Connecting to Resolve...</div>;
  if (connection.kind === "preview") {
    return (
      <div className="banner warn">
        Browser preview: not running inside Resolve, Insert goes to a FakeHostAdapter.
      </div>
    );
  }
  if (connection.kind === "error") {
    return (
      <div className="banner error">
        Could not talk to the plugin main process: {connection.message}
      </div>
    );
  }
  const { status } = connection;
  switch (status.state) {
    case "ready":
      return status.isStudio ? (
        <div className="banner ok">
          Connected to {status.productName} {status.info.version} on {status.info.os}
          <span className="muted">
            WorkflowIntegration.node {status.moduleVersion ?? "?"} from {status.modulePath}
          </span>
        </div>
      ) : (
        <div className="banner warn">
          Connected to {status.productName} {status.info.version}, which is not the Studio edition.
          Workflow Integration plugins only load in DaVinci Resolve Studio; Insert will most likely
          fail here. Use the ICG web app instead.
        </div>
      );
    case "module-missing":
      return (
        <div className="banner error">
          WorkflowIntegration.node was not found. Checked:
          <pre>{status.triedPaths.join("\n")}</pre>
          Copy it from Resolve&apos;s Developer/Workflow Integrations/Examples/SamplePlugin folder
          next to main.js, or point ICG_WORKFLOW_INTEGRATION_NODE at it.
        </div>
      );
    case "module-failed":
      return (
        <div className="banner error">
          WorkflowIntegration.node at {status.modulePath} could not be loaded: {status.message}
        </div>
      );
    case "init-failed":
      return (
        <div className="banner error">
          Resolve refused the plugin ({status.message}). This happens when the plugin runs outside
          Resolve Studio, or when the plugin id does not match manifest.xml.
        </div>
      );
  }
}
