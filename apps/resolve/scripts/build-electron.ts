import { build } from "esbuild";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = new URL("../dist/com.icg.resolve/", import.meta.url);

await build({
  absWorkingDir: appDir,
  entryPoints: { main: "src/main/index.ts", preload: "src/preload/index.ts" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  outdir: fileURLToPath(outDir),
  external: ["electron"],
  logLevel: "info",
});

await cp(new URL("../plugin/", import.meta.url), outDir, { recursive: true });
