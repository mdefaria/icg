import { z } from "zod";
import { EVALSCRIPT_ERROR, type CSInterfaceLike } from "./globals";

export type EvalScript = (script: string) => Promise<string>;

export class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

const Envelope = z.union([
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);

export interface Bridge {
  call<T>(fn: string, schema: z.ZodType<T>, args?: unknown): Promise<T>;
}

export function scriptFor(fn: string, args?: unknown): string {
  if (!/^[A-Za-z_]\w*$/.test(fn))
    throw new BridgeError("bad-call", `Invalid bridge function ${fn}`);
  const literal = args === undefined ? "" : JSON.stringify(JSON.stringify(args));
  return `ICG.${fn}(${literal})`;
}

export function createBridge(evalScript: EvalScript): Bridge {
  return {
    async call<T>(fn: string, schema: z.ZodType<T>, args?: unknown): Promise<T> {
      const raw = await evalScript(scriptFor(fn, args));
      if (raw === EVALSCRIPT_ERROR) {
        throw new BridgeError(
          "evalscript",
          `ICG.${fn} threw in ExtendScript or icg.jsx is not loaded`,
        );
      }
      if (typeof raw !== "string" || raw.length === 0) {
        throw new BridgeError("empty", `ICG.${fn} returned nothing`);
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new BridgeError("bad-json", `ICG.${fn} returned invalid JSON: ${raw.slice(0, 200)}`);
      }
      const envelope = Envelope.safeParse(json);
      if (!envelope.success) {
        throw new BridgeError("bad-envelope", `ICG.${fn} returned an unexpected shape`);
      }
      if (!envelope.data.ok) {
        throw new BridgeError(envelope.data.error.code, envelope.data.error.message);
      }
      const parsed = schema.safeParse(envelope.data.result);
      if (!parsed.success) {
        throw new BridgeError(
          "schema",
          `ICG.${fn} result failed validation: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
  };
}

export function evalScriptFrom(cs: CSInterfaceLike): EvalScript {
  return (script) => new Promise((resolve) => cs.evalScript(script, resolve));
}
