import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import {
  CHANNELS,
  InsertRequest,
  OpenExternalRequest,
  ReadAssetRequest,
  WriteTempFileRequest,
  type InsertResultMessage,
} from "../ipc/contract";
import { readFileInside, writePng } from "./files";
import { ResolveHost } from "./resolve-host";
import { connect, type Connection } from "./workflow-integration";

const pluginDir = __dirname;
let connection: Promise<Connection> | null = null;

function getConnection(): Promise<Connection> {
  connection ??= connect(pluginDir);
  return connection;
}

async function getHost(): Promise<ResolveHost | null> {
  const { resolve } = await getConnection();
  return resolve ? new ResolveHost(resolve) : null;
}

const overlayDir = () => path.join(app.getPath("userData"), "overlays");
const tempDir = () => path.join(app.getPath("temp"), "icg");

function registerIpc(): void {
  ipcMain.handle(CHANNELS.hostStatus, async () => (await getConnection()).status);

  ipcMain.handle(CHANNELS.sequenceInfo, async () => {
    const host = await getHost();
    return host ? host.getSequenceInfo() : null;
  });

  ipcMain.handle(CHANNELS.insertOverlay, async (_event, raw): Promise<InsertResultMessage> => {
    const request = InsertRequest.parse(raw);
    const host = await getHost();
    if (!host) return { status: "failed", reason: "Not connected to Resolve" };
    try {
      return await host.insertOverlay(request, (png, label) => writePng(overlayDir(), label, png));
    } catch (error) {
      return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(CHANNELS.writeTempFile, async (_event, raw) => {
    const request = WriteTempFileRequest.parse(raw);
    return { path: await writePng(tempDir(), request.label, request.png) };
  });

  ipcMain.handle(CHANNELS.readAsset, (_event, raw) => {
    const request = ReadAssetRequest.parse(raw);
    return readFileInside(pluginDir, request.url);
  });

  ipcMain.handle(CHANNELS.openExternal, (_event, raw) => {
    const request = OpenExternalRequest.parse(raw);
    if (!/^https?:/.test(request.url)) throw new Error("Only http(s) links can be opened");
    return shell.openExternal(request.url);
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 520,
    height: 900,
    useContentSize: true,
    title: "ICG",
    backgroundColor: "#1b1b1b",
    webPreferences: {
      preload: path.join(pluginDir, "preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setMenuBarVisibility(false);
  window.on("close", () => app.quit());
  void window.loadFile(path.join(pluginDir, "renderer", "index.html"));
  if (process.env.ICG_DEVTOOLS) window.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(() => {
  registerIpc();
  void getConnection();
  createWindow();
});

app.on("window-all-closed", () => app.quit());

app.on("will-quit", () => {
  void connection?.then((c) => c.module?.CleanUp());
});
