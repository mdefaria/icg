export type RgbColor = { red: number; green: number; blue: number; alpha?: number };

export type AppSkinInfo = {
  baseFontSize?: number;
  panelBackgroundColor?: { color?: RgbColor };
};

export type HostEnvironment = {
  appName: string;
  appVersion: string;
  appId?: string;
  appSkinInfo?: AppSkinInfo;
};

export interface CSInterfaceLike {
  getHostEnvironment(): HostEnvironment;
  evalScript(script: string, callback: (result: string) => void): void;
  getSystemPath(pathType: string): string;
  getOSInformation(): string;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  openURLInDefaultBrowser(url: string): unknown;
}

type CSInterfaceConstructor = {
  new (): CSInterfaceLike;
  THEME_COLOR_CHANGED_EVENT: string;
};

export type NodeRequire = (id: string) => unknown;

export type CepNode = {
  require: NodeRequire;
};

declare global {
  interface Window {
    __adobe_cep__?: unknown;
    CSInterface?: CSInterfaceConstructor;
    cep_node?: CepNode;
    cep?: { util?: { openURLInDefaultBrowser(url: string): void } };
    require?: NodeRequire;
  }
}

export const EVALSCRIPT_ERROR = "EvalScript error.";
export const SYSTEM_PATH_EXTENSION = "extension";
export const THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

export function isCep(): boolean {
  return typeof window !== "undefined" && !!window.__adobe_cep__ && !!window.CSInterface;
}

export function createCSInterface(): CSInterfaceLike | null {
  if (!isCep() || !window.CSInterface) return null;
  return new window.CSInterface();
}

export function cepNode(): CepNode | null {
  if (typeof window === "undefined") return null;
  if (window.cep_node && typeof window.cep_node.require === "function") return window.cep_node;
  if (typeof window.require === "function") return { require: window.require };
  return null;
}

export function openUrlViaCep(url: string): boolean {
  if (typeof window === "undefined") return false;
  const util = window.cep?.util;
  if (util && typeof util.openURLInDefaultBrowser === "function") {
    util.openURLInDefaultBrowser(url);
    return true;
  }
  return false;
}
