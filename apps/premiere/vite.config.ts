import { copyFileSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;
const dist = resolve(root, "dist");

function copyCepFiles(): Plugin {
  return {
    name: "icg-copy-cep-files",
    apply: "build",
    closeBundle() {
      for (const dir of ["CSXS", "jsx", "vendor"]) {
        cpSync(resolve(root, dir), resolve(dist, dir), { recursive: true });
      }
      copyFileSync(resolve(root, ".debug"), resolve(dist, ".debug"));
    },
  };
}

function classicScripts(): Plugin {
  return {
    name: "icg-classic-scripts",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin src=/g, "<script defer src=");
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), classicScripts(), copyCepFiles()],
  build: {
    target: "chrome88",
    assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/panel.js",
      },
    },
  },
});
