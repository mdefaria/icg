import type { ResolveBridge } from "../preload/index";

declare global {
  interface Window {
    icgResolve?: ResolveBridge;
  }
}

export function getBridge(): ResolveBridge | null {
  return typeof window === "undefined" ? null : (window.icgResolve ?? null);
}
