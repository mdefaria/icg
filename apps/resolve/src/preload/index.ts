import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS } from "../ipc/channels";

export type ResolveBridge = {
  hostStatus(): Promise<unknown>;
  sequenceInfo(): Promise<unknown>;
  insertOverlay(request: {
    png: Uint8Array;
    durationSeconds: number;
    label: string;
  }): Promise<unknown>;
  writeTempFile(request: { png: Uint8Array; label: string }): Promise<unknown>;
  readAsset(url: string): Promise<unknown>;
  openExternal(url: string): Promise<void>;
};

const bridge: ResolveBridge = {
  hostStatus: () => ipcRenderer.invoke(CHANNELS.hostStatus),
  sequenceInfo: () => ipcRenderer.invoke(CHANNELS.sequenceInfo),
  insertOverlay: (request) => ipcRenderer.invoke(CHANNELS.insertOverlay, request),
  writeTempFile: (request) => ipcRenderer.invoke(CHANNELS.writeTempFile, request),
  readAsset: (url) => ipcRenderer.invoke(CHANNELS.readAsset, { url }),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, { url }),
};

contextBridge.exposeInMainWorld("icgResolve", bridge);
