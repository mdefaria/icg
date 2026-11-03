import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/com.icg.resolve/renderer",
    emptyOutDir: true,
    target: "chrome120",
    assetsInlineLimit: 0,
  },
});
