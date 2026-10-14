// Repo-wide Vite+ config: `vp lint` (Oxlint), `vp fmt` (Oxfmt), `vp test` (Vitest) and the `vp staged` pre-commit
// hook. Contract C15 (docs/ARCHITECTURE.md §2): files <= 800 lines and functions <= complexity 15 are hard errors;
// the fix is a split, never a suppression. C12/C2/C3: core packages import no runtime-specific modules, and the
// domain uses no floats or Date.
import { builtinModules } from "node:module";

import { defineConfig } from "vite-plus";

// Bare builtins too (`fs`, `fs/promises`), not only the `node:` form. Exact names go in `paths`: as a gitignore
// pattern, the builtin `domain` would also match `@senstosales/domain`.
const C12 = "C12: core packages import ports, not runtime modules.";
const RUNTIME_MODULES = [...builtinModules, "playwright", "playwright-core"];
// `**`: a single `*` stops at the next `/`, so `node:fs/promises` or `@tauri-apps/api/core` would pass.
const RUNTIME_PREFIXES = [
  "node:*",
  "node:*/**",
  "playwright/**",
  "playwright-core/**",
  "@playwright/**",
  "@tauri-apps/**",
];
const NO_RUNTIME_IMPORTS: [
  "error",
  {
    paths: Array<{ name: string; message: string }>;
    patterns: Array<{ group: string[]; message: string }>;
  },
] = [
  "error",
  {
    paths: RUNTIME_MODULES.map((name) => ({ name, message: C12 })),
    patterns: [{ group: RUNTIME_PREFIXES, message: C12 }],
  },
];

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
        // C12: core packages depend on ports. apps/* (including apps/desktop) are not covered.
        files: ["packages/*/src/**"],
        rules: { "no-restricted-imports": NO_RUNTIME_IMPORTS },
      },
      {
        // C12: a package's port adapters (node:sqlite for Db, Playwright for Scraper) live in its src/platform/.
        files: ["packages/*/src/platform/**"],
        rules: { "no-restricted-imports": "off" },
      },
      {
        // C3: integer milli-units and 1e-5 money, YYYY-MM-DD strings; no floats or Date in the domain.
        files: ["packages/domain/src/**"],
        rules: {
          // The domain has no I/O and so no adapters: the C12 ban holds in all of it, src/platform/ included.
          "no-restricted-imports": NO_RUNTIME_IMPORTS,
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
  // Parser fixture pages keep the BHEL markup as served (SPEC-06 §4.3): reformatting would change what is parsed.
  fmt: { printWidth: 120, ignorePatterns: ["pnpm-lock.yaml", "LICENSE", "packages/parsers/fixtures/**/*.html"] },
  test: { include: ["{packages,apps,tools}/*/test/**/*.test.ts"] },
  staged: {
    "*.{js,mjs,cjs,ts,tsx,json,jsonc,css,md,yml,yaml}": "vp check --fix",
    // C1: a function task gets no file list appended; the scan reads the staged index itself.
    "*": () => "node tools/checks/src/real-data-scan.ts --staged",
  },
});
