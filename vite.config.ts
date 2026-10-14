// Repo-wide Vite+ config: `vp lint` (Oxlint), `vp fmt` (Oxfmt), `vp test` (Vitest) and the `vp staged` pre-commit
// hook. Contract C15 (docs/ARCHITECTURE.md §2): files <= 800 lines and functions <= complexity 15 are hard errors;
// the fix is a split, never a suppression. C12/C2/C3: core packages import no runtime-specific modules, and the
// domain uses no floats or Date.
import { defineConfig } from "vite-plus";

const RUNTIME_MODULES = ["node:*", "playwright", "playwright-core", "@playwright/*", "@tauri-apps/*"];

export default defineConfig({
  lint: {
    plugins: ["typescript", "unicorn", "import"],
    options: { denyWarnings: true, reportUnusedDisableDirectives: "error" },
    categories: { correctness: "error" },
    env: { builtin: true, node: true },
    ignorePatterns: ["**/generated/**", "**/coverage/**"],
    rules: {
      "max-lines": ["error", 800],
      complexity: ["error", 15],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "typescript/no-explicit-any": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/consistent-type-imports": "error",
    },
    overrides: [
      {
        // C12: core packages depend on ports; runtime adapters live in packages/platform-* and apps/desktop.
        files: ["packages/*/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [{ group: RUNTIME_MODULES, message: "C12: core packages import ports, not runtime modules." }],
            },
          ],
        },
      },
      {
        // C3: integer milli-units and 1e-5 money, YYYY-MM-DD strings; no floats or Date in the domain.
        files: ["packages/domain/src/**"],
        rules: {
          "no-restricted-globals": [
            "error",
            { name: "Date", message: "C3: dates are YYYY-MM-DD strings in the domain." },
            { name: "parseFloat", message: "C3: quantities and money are integers; parse decimals exactly." },
          ],
          "no-restricted-properties": [
            "error",
            { object: "Number", property: "parseFloat", message: "C3: no floats in the domain." },
            { property: "toFixed", message: "C3: no float rounding in the domain." },
          ],
        },
      },
    ],
  },
  fmt: { printWidth: 120, ignorePatterns: ["pnpm-lock.yaml", "LICENSE"] },
  test: { include: ["{packages,apps,tools}/*/test/**/*.test.ts"] },
  staged: {
    "*.{js,mjs,cjs,ts,tsx,json,jsonc,css,md,yml,yaml}": "vp check --fix",
    // C1: a function task gets no file list appended; the scan reads the staged index itself.
    "*": () => "node tools/checks/src/real-data-scan.ts --staged",
  },
});
