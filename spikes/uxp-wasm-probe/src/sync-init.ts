import { initWasm } from "@resvg/resvg-wasm";
import { now } from "./now.js";

export type SyncInitReport = {
  /** `new WebAssembly.Module(bytes)`, the synchronous compile. */
  compileMs: number;
  /** `new WebAssembly.Instance(module, imports)` inside the shim. */
  instantiateMs: number;
  /** True when the glue reached our shim (it must, or the probe proves nothing). */
  shimUsed: boolean;
  /** Whether the environment had a `WebAssembly.instantiate` before we touched it. */
  hadNativeInstantiate: boolean;
};

type Instantiate = typeof WebAssembly.instantiate;

/**
 * Initialise `@resvg/resvg-wasm` using only the synchronous WebAssembly API.
 *
 * The package exports only the async `initWasm`, and the wasm-bindgen imports
 * object is private to its module, so an Instance built outside cannot be handed
 * in. `initWasm` does accept a precompiled `WebAssembly.Module`, after which the
 * glue calls `WebAssembly.instantiate(module, imports)`. For the duration of the
 * call we replace that function with one that constructs the Instance
 * synchronously and returns it in an already-resolved Promise, so the only
 * asynchrony left is microtask plumbing that every UXP version provides.
 */
export async function initResvgSync(bytes: BufferSource): Promise<SyncInitReport> {
  const t0 = now();
  const module = new WebAssembly.Module(bytes);
  const report: SyncInitReport = {
    compileMs: now() - t0,
    instantiateMs: -1,
    shimUsed: false,
    hadNativeInstantiate: typeof WebAssembly.instantiate === "function",
  };

  const shim = ((source: unknown, imports?: WebAssembly.Imports) => {
    report.shimUsed = true;
    if (!(source instanceof WebAssembly.Module)) {
      return Promise.reject(new Error("initResvgSync shim expected a WebAssembly.Module"));
    }
    try {
      const t1 = now();
      const instance = new WebAssembly.Instance(source, imports);
      report.instantiateMs = now() - t1;
      return Promise.resolve(instance);
    } catch (error) {
      return Promise.reject(error);
    }
  }) as unknown as Instantiate;

  const wasmObject = WebAssembly as unknown as Record<string, unknown>;
  const original = Object.getOwnPropertyDescriptor(WebAssembly, "instantiate");
  Object.defineProperty(WebAssembly, "instantiate", {
    value: shim,
    configurable: true,
    writable: true,
  });
  if (WebAssembly.instantiate !== shim) {
    throw new Error(
      "Could not replace WebAssembly.instantiate; vendor and patch the glue instead (see SPIKE.md)",
    );
  }
  try {
    await initWasm(module);
  } finally {
    if (original) {
      Object.defineProperty(WebAssembly, "instantiate", original);
    } else {
      delete wasmObject["instantiate"];
    }
  }
  if (!report.shimUsed) {
    throw new Error(
      "resvg-wasm initialised without going through the synchronous shim; the glue changed and this probe is no longer representative",
    );
  }
  return report;
}
