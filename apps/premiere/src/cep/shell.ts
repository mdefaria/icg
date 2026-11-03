import type { HostInfo, Theme } from "@icg/shared";
import type { Unsubscribe } from "@icg/host-sdk";
import {
  THEME_COLOR_CHANGED_EVENT,
  openUrlViaCep,
  type CSInterfaceLike,
  type HostEnvironment,
  type RgbColor,
} from "./globals";

export interface PanelShell {
  readonly info: HostInfo;
  getTheme(): Theme;
  onThemeChange(listener: (theme: Theme) => void): Unsubscribe;
  openExternal(url: string): void;
}

export function themeFromColor(color: RgbColor | undefined): Theme {
  if (!color) return "dark";
  const luminance = 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue;
  return luminance < 128 ? "dark" : "light";
}

export function themeFromEnvironment(env: HostEnvironment | null | undefined): Theme {
  return themeFromColor(env?.appSkinInfo?.panelBackgroundColor?.color);
}

export function osFromInformation(osInformation: string): HostInfo["os"] {
  if (/mac/i.test(osInformation)) return "mac";
  if (/win/i.test(osInformation)) return "win";
  return "other";
}

export function createCepShell(cs: CSInterfaceLike): PanelShell {
  const env = cs.getHostEnvironment();
  return {
    info: {
      kind: "premiere",
      version: env.appVersion,
      os: osFromInformation(cs.getOSInformation()),
    },
    getTheme: () => themeFromEnvironment(cs.getHostEnvironment()),
    onThemeChange(listener) {
      let current = themeFromEnvironment(cs.getHostEnvironment());
      const handler = () => {
        const next = themeFromEnvironment(cs.getHostEnvironment());
        if (next === current) return;
        current = next;
        listener(next);
      };
      cs.addEventListener(THEME_COLOR_CHANGED_EVENT, handler);
      return () => cs.removeEventListener(THEME_COLOR_CHANGED_EVENT, handler);
    },
    openExternal(url) {
      if (openUrlViaCep(url)) return;
      cs.openURLInDefaultBrowser(url);
    },
  };
}
