import { initWasm } from "@resvg/resvg-wasm";

export type WasmSource =
  WebAssembly.Module | ArrayBuffer | ArrayBufferView | Response | Promise<Response> | URL | string;

let ready: Promise<void> | undefined;
let initialised = false;

const hasNode = (): boolean =>
  !!(globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;

const REMOTE = /^(https?|blob|data):/i;

async function readFile(path: string | URL): Promise<Uint8Array<ArrayBuffer>> {
  const fsSpecifier = "node:fs/promises";
  const fs = (await import(/* @vite-ignore */ fsSpecifier)) as {
    readFile(p: string | URL): Promise<Uint8Array<ArrayBuffer>>;
  };
  return fs.readFile(path);
}

async function fromLocation(location: string | URL): Promise<BufferSource> {
  const text = location.toString();
  if (REMOTE.test(text) || !hasNode()) {
    const res = await fetch(location);
    if (!res.ok) throw new Error(`could not fetch the renderer wasm from ${text}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return readFile(text.startsWith("file:") ? new URL(text) : text);
}

async function normalise(source: WasmSource): Promise<WebAssembly.Module | BufferSource> {
  const value = await source;
  if (typeof value === "string" || value instanceof URL) return fromLocation(value);
  if (typeof Response !== "undefined" && value instanceof Response) {
    if (!value.ok) throw new Error(`renderer wasm response failed: ${value.status}`);
    return new Uint8Array(await value.arrayBuffer());
  }
  return value;
}

async function loadBundledWasm(): Promise<BufferSource> {
  if (!hasNode())
    throw new Error(
      "initRenderer() needs a source outside Node: pass the wasm URL, bytes or module",
    );
  const moduleSpecifier = "node:module";
  const { createRequire } = (await import(/* @vite-ignore */ moduleSpecifier)) as {
    createRequire(url: string): { resolve(id: string): string };
  };
  const require = createRequire(import.meta.url);
  return readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
}

export function initRenderer(source?: WasmSource): Promise<void> {
  if (!ready) {
    const input = source === undefined ? loadBundledWasm() : normalise(source);
    ready = input
      .then((resolved) => initWasm(resolved as Parameters<typeof initWasm>[0]))
      .then(() => {
        initialised = true;
      })
      .catch((error: unknown) => {
        ready = undefined;
        throw error;
      });
  }
  return ready;
}

export const isRendererReady = (): boolean => initialised;
