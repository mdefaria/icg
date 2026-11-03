import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BridgeError, createBridge, scriptFor } from "./bridge";

const Result = z.object({ value: z.number() });

function bridgeReturning(raw: string, seen: string[] = []) {
  return createBridge((script) => {
    seen.push(script);
    return Promise.resolve(raw);
  });
}

async function failure(promise: Promise<unknown>): Promise<BridgeError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BridgeError) return error;
    throw error;
  }
  throw new Error("expected a BridgeError");
}

describe("scriptFor", () => {
  it("calls the ICG namespace with no arguments", () => {
    expect(scriptFor("ping")).toBe("ICG.ping()");
  });

  it("passes arguments as one JSON string literal so ExtendScript can JSON.parse it", () => {
    const script = scriptFor("insert", { path: 'C:\\tmp\\a "b".png', trackIndex: 1 });
    expect(script.startsWith("ICG.insert(")).toBe(true);
    const literal = script.slice("ICG.insert(".length, -1);
    expect(JSON.parse(JSON.parse(literal) as string)).toEqual({
      path: 'C:\\tmp\\a "b".png',
      trackIndex: 1,
    });
  });

  it("rejects function names that are not identifiers", () => {
    expect(() => scriptFor("ping(); alert(1)")).toThrow(BridgeError);
  });
});

describe("createBridge", () => {
  it("unwraps an ok envelope and validates the result", async () => {
    const seen: string[] = [];
    const bridge = bridgeReturning(JSON.stringify({ ok: true, result: { value: 3 } }), seen);
    await expect(bridge.call("getValue", Result, { x: 1 })).resolves.toEqual({ value: 3 });
    expect(seen).toEqual(['ICG.getValue("{\\"x\\":1}")']);
  });

  it("turns an error envelope into a BridgeError with the ExtendScript code", async () => {
    const bridge = bridgeReturning(
      JSON.stringify({ ok: false, error: { code: "track-occupied", message: "V2 is busy" } }),
    );
    const error = await failure(bridge.call("insert", Result));
    expect(error.code).toBe("track-occupied");
    expect(error.message).toBe("V2 is busy");
  });

  it("reports the CSInterface evalScript sentinel", async () => {
    const error = await failure(bridgeReturning("EvalScript error.").call("ping", Result));
    expect(error.code).toBe("evalscript");
  });

  it("reports non-JSON output", async () => {
    const error = await failure(bridgeReturning("undefined").call("ping", Result));
    expect(error.code).toBe("bad-json");
  });

  it("reports an envelope with the wrong shape", async () => {
    const error = await failure(bridgeReturning('{"value":3}').call("ping", Result));
    expect(error.code).toBe("bad-envelope");
  });

  it("reports a result that fails the schema", async () => {
    const bridge = bridgeReturning(JSON.stringify({ ok: true, result: { value: "three" } }));
    const error = await failure(bridge.call("getValue", Result));
    expect(error.code).toBe("schema");
  });
});
