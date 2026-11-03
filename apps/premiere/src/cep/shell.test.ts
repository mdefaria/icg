import { describe, expect, it } from "vitest";
import { THEME_COLOR_CHANGED_EVENT, type CSInterfaceLike, type HostEnvironment } from "./globals";
import { createCepShell, osFromInformation, themeFromColor } from "./shell";

function environment(red: number, green: number, blue: number): HostEnvironment {
  return {
    appName: "PPRO",
    appVersion: "25.2.0",
    appSkinInfo: { panelBackgroundColor: { color: { red, green, blue, alpha: 255 } } },
  };
}

class FakeCSInterface implements CSInterfaceLike {
  env = environment(35, 35, 35);
  os = "Mac OS X 14.5";
  opened: string[] = [];
  listeners = new Map<string, Set<(event: unknown) => void>>();

  getHostEnvironment() {
    return this.env;
  }
  evalScript(_script: string, callback: (result: string) => void) {
    callback("EvalScript error.");
  }
  getSystemPath() {
    return "/ext";
  }
  getOSInformation() {
    return this.os;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  openURLInDefaultBrowser(url: string) {
    this.opened.push(url);
  }
  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type });
  }
}

describe("themeFromColor", () => {
  it("maps Premiere's panel background to the Theme enum", () => {
    expect(themeFromColor({ red: 35, green: 35, blue: 35 })).toBe("dark");
    expect(themeFromColor({ red: 83, green: 83, blue: 83 })).toBe("dark");
    expect(themeFromColor({ red: 184, green: 184, blue: 184 })).toBe("light");
    expect(themeFromColor({ red: 240, green: 240, blue: 240 })).toBe("light");
    expect(themeFromColor(undefined)).toBe("dark");
  });
});

describe("osFromInformation", () => {
  it("recognises CSInterface.getOSInformation strings", () => {
    expect(osFromInformation("Mac OS X 10.15.7")).toBe("mac");
    expect(osFromInformation("Windows 10 64-bit")).toBe("win");
    expect(osFromInformation("Linux")).toBe("other");
  });
});

describe("createCepShell", () => {
  it("builds host info from the host environment", () => {
    const cs = new FakeCSInterface();
    expect(createCepShell(cs).info).toEqual({ kind: "premiere", version: "25.2.0", os: "mac" });
    cs.os = "Windows 11 64-bit";
    expect(createCepShell(cs).info.os).toBe("win");
  });

  it("notifies only when the theme actually flips, until unsubscribed", () => {
    const cs = new FakeCSInterface();
    const shell = createCepShell(cs);
    const seen: string[] = [];
    const stop = shell.onThemeChange((t) => seen.push(t));
    cs.env = environment(50, 50, 50);
    cs.fire(THEME_COLOR_CHANGED_EVENT);
    cs.env = environment(220, 220, 220);
    cs.fire(THEME_COLOR_CHANGED_EVENT);
    expect(seen).toEqual(["light"]);
    expect(shell.getTheme()).toBe("light");
    stop();
    cs.env = environment(30, 30, 30);
    cs.fire(THEME_COLOR_CHANGED_EVENT);
    expect(seen).toEqual(["light"]);
    expect(cs.listeners.get(THEME_COLOR_CHANGED_EVENT)?.size).toBe(0);
  });

  it("falls back to CSInterface for opening urls outside CEP", () => {
    const cs = new FakeCSInterface();
    createCepShell(cs).openExternal("https://example.com/docs");
    expect(cs.opened).toEqual(["https://example.com/docs"]);
  });
});
