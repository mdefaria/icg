// Panel script for the UXP probe. Bundled by build.mjs into a classic script
// (IIFE), so UXP never sees ESM syntax; `require` below is UXP's global.
import { PROBE_HEIGHT, PROBE_WIDTH, renderProbe } from "../src/probe-render.ts";
import { initResvgSync } from "../src/sync-init.ts";
import { now } from "../src/now.ts";

const WASM_FILE = "index_bg.wasm";
const FONT_FILE = "Inter-Regular.ttf";
const PNG_TEMP_PATH = "plugin-temp:/probe.png";

const runButton = document.getElementById("run");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const img = document.getElementById("out");

const lines = [];
function say(line) {
  lines.push(line);
  logEl.textContent = lines.join("\n");
  console.log("[wasm-probe] " + line);
}
function ms(value) {
  return value < 0 ? "n/a" : value.toFixed(1) + " ms";
}
function describeError(error) {
  if (error && error.stack) return String(error.stack);
  return String(error);
}
function setStatus(text) {
  statusEl.textContent = text;
}

function environmentSummary() {
  const out = [];
  try {
    const uxp = require("uxp");
    const host = uxp.host || {};
    out.push("host: " + (host.name || "?") + " " + (host.version || "?"));
    const versions = uxp.versions || {};
    out.push("uxp: " + (versions.uxp || "?") + ", plugin: " + (versions.plugin || "?"));
  } catch (error) {
    out.push("require('uxp') failed: " + describeError(error));
  }
  out.push(
    "WebAssembly: " +
      typeof WebAssembly +
      ", .Module: " +
      (typeof WebAssembly === "object" ? typeof WebAssembly.Module : "-") +
      ", .instantiate: " +
      (typeof WebAssembly === "object" ? typeof WebAssembly.instantiate : "-"),
  );
  out.push(
    "TextEncoder: " +
      typeof TextEncoder +
      ", TextDecoder: " +
      typeof TextDecoder +
      ", performance.now: " +
      (typeof performance === "object" ? typeof performance.now : "-") +
      ", btoa: " +
      typeof btoa,
  );
  return out.join("\n");
}

async function readPluginBinary(name) {
  const { localFileSystem, formats } = require("uxp").storage;
  const pluginFolder = await localFileSystem.getPluginFolder();
  const entry = await pluginFolder.getEntry(name);
  const data = await entry.read({ format: formats.binary });
  if (!(data instanceof ArrayBuffer)) {
    throw new Error(
      name + ": expected ArrayBuffer from File.read, got " + Object.prototype.toString.call(data),
    );
  }
  return data;
}

async function writePng(png) {
  const standalone = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
  try {
    const fs = require("fs");
    await fs.writeFile(PNG_TEMP_PATH, standalone);
    return { method: "fs.writeFile", path: PNG_TEMP_PATH, entry: null };
  } catch (fsError) {
    say("fs.writeFile failed, falling back to storage API: " + describeError(fsError));
    const { localFileSystem, formats } = require("uxp").storage;
    const temp = await localFileSystem.getTemporaryFolder();
    const file = await temp.createFile("probe.png", { overwrite: true });
    await file.write(standalone, { format: formats.binary });
    return { method: "File.write", path: file.nativePath || PNG_TEMP_PATH, entry: file };
  }
}

function toDataUrl(png) {
  let binary = "";
  for (let i = 0; i < png.byteLength; i += 0x2000) {
    binary += String.fromCharCode.apply(null, png.subarray(i, i + 0x2000));
  }
  return "data:image/png;base64," + btoa(binary);
}

// Try each img source in turn; UXP accepts a path, a File entry, or a data URL
// depending on version, and which one works is itself a finding.
function showPng(png, written) {
  const candidates = [
    { label: "path " + written.path, src: written.path },
    written.entry ? { label: "File entry", src: written.entry } : null,
    { label: "data URL", src: toDataUrl(png) },
  ].filter(Boolean);

  return new Promise((resolve) => {
    let index = 0;
    const tryNext = () => {
      if (index >= candidates.length) {
        say("img: no source worked");
        resolve(false);
        return;
      }
      const candidate = candidates[index++];
      img.onload = () => {
        say(
          "img: loaded from " +
            candidate.label +
            " (" +
            (img.naturalWidth || "?") +
            "x" +
            (img.naturalHeight || "?") +
            ")",
        );
        resolve(true);
      };
      img.onerror = (event) => {
        say(
          "img: " +
            candidate.label +
            " failed" +
            (event && event.message ? ": " + event.message : ""),
        );
        tryNext();
      };
      img.src = candidate.src;
    };
    tryNext();
  });
}

let initReport = null;

async function runProbe() {
  lines.length = 0;
  img.src = "";
  setStatus("running...");
  runButton.disabled = true;
  const started = now();
  try {
    say(environmentSummary());

    const tRead = now();
    const wasmBytes = await readPluginBinary(WASM_FILE);
    const fontBytes = await readPluginBinary(FONT_FILE);
    say(
      "read " +
        WASM_FILE +
        " " +
        wasmBytes.byteLength +
        " B and " +
        FONT_FILE +
        " " +
        fontBytes.byteLength +
        " B in " +
        ms(now() - tRead),
    );

    if (initReport) {
      say("wasm already initialised by an earlier click; reusing the instance");
    } else {
      initReport = await initResvgSync(wasmBytes);
      say("new WebAssembly.Module: " + ms(initReport.compileMs));
      say(
        "new WebAssembly.Instance (via shim; native instantiate present: " +
          initReport.hadNativeInstantiate +
          "): " +
          ms(initReport.instantiateMs),
      );
    }

    const render = renderProbe([new Uint8Array(fontBytes)]);
    if (render.width !== PROBE_WIDTH || render.height !== PROBE_HEIGHT) {
      throw new Error("unexpected render size " + render.width + "x" + render.height);
    }
    say(
      "render " +
        render.width +
        "x" +
        render.height +
        " PNG " +
        render.png.byteLength +
        " B in " +
        ms(render.renderMs),
    );

    const tWrite = now();
    const written = await writePng(render.png);
    say("wrote " + written.path + " via " + written.method + " in " + ms(now() - tWrite));

    const shown = await showPng(render.png, written);
    say("total " + ms(now() - started));
    say(
      shown ? "RESULT: PASS" : "RESULT: PASS (render + write) but the <img> could not display it",
    );
    setStatus(shown ? "PASS" : "PASS, img failed");
  } catch (error) {
    say("RESULT: FAIL\n" + describeError(error));
    setStatus("FAIL");
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => {
  runProbe();
});
