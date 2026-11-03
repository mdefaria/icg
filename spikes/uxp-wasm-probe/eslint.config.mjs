import root from "../../eslint.config.mjs";

const uxpPanelGlobals = {
  document: "readonly",
  window: "readonly",
  console: "readonly",
  require: "readonly",
  WebAssembly: "readonly",
  performance: "readonly",
  btoa: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
};

export default [
  ...root,
  {
    files: ["plugin-src/**/*.js"],
    languageOptions: { sourceType: "module", globals: uxpPanelGlobals },
    // `require` here is UXP's host module loader, not CommonJS.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["build.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
];
