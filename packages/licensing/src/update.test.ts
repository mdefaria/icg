import { describe, expect, it } from "vitest";
import { checkForUpdate, compareVersions } from "./update";

const API = "https://api.icg.test";
const release = { latest: "0.2.0", url: "https://icg.test/download/x.zip", notes: "Fixes." };

function options(fetchImpl: typeof fetch, currentVersion = "0.1.0") {
  return { apiBaseUrl: `${API}/`, host: "premiere" as const, currentVersion, fetch: fetchImpl };
}

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "2.0.0")).toBe(-1);
    expect(compareVersions("v1.0.1", "1.0.0")).toBe(1);
  });

  it("ranks a pre-release below its release and compares identifiers", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
    expect(compareVersions("1.0.0+build5", "1.0.0")).toBe(0);
  });

  it("returns null for text that is not a version", () => {
    expect(compareVersions("latest", "1.0.0")).toBeNull();
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
  });
});

describe("checkForUpdate", () => {
  it("asks /version for the Host and returns a newer release", async () => {
    const urls: string[] = [];
    const result = await checkForUpdate(
      options(async (input) => {
        urls.push(String(input));
        return Response.json(release);
      }),
    );
    expect(result).toEqual(release);
    expect(urls).toEqual([`${API}/version?host=premiere`]);
  });

  it("returns null when up to date or ahead", async () => {
    const respond = async () => Response.json(release);
    expect(await checkForUpdate(options(respond, "0.2.0"))).toBeNull();
    expect(await checkForUpdate(options(respond, "0.3.0"))).toBeNull();
  });

  it("returns null and never throws on network errors, bad status or bad bodies", async () => {
    expect(
      await checkForUpdate(options(() => Promise.reject(new TypeError("offline")))),
    ).toBeNull();
    expect(
      await checkForUpdate(options(async () => new Response("down", { status: 503 }))),
    ).toBeNull();
    expect(await checkForUpdate(options(async () => new Response("<html>")))).toBeNull();
    expect(await checkForUpdate(options(async () => Response.json({ latest: 2 })))).toBeNull();
    expect(
      await checkForUpdate(options(async () => Response.json({ ...release, latest: "soon" }))),
    ).toBeNull();
  });
});
