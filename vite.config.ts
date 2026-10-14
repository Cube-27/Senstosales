// Repo-wide Vite+ config: `vp lint` (Oxlint), `vp fmt` (Oxfmt), `vp test` (Vitest) and the `vp staged` pre-commit
// hook. Contract C15 (docs/ARCHITECTURE.md §2): files <= 800 lines and functions <= complexity 15 are hard errors;
// the fix is a split, never a suppression.
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript", "unicorn", "import"],
    options: { denyWarnings: true, reportUnusedDisableDirectives: "error" },
    categories: { correctness: "error" },
    env: { builtin: true, node: true },
    ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/generated/**", "**/coverage/**", "**/license-report/**"],
    rules: {
      "max-lines": ["error", { max: 800, skipBlankLines: false, skipComments: false }],
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
  },
  fmt: { printWidth: 120, ignorePatterns: ["pnpm-lock.yaml", "LICENSE", "**/license-report/**"] },
  test: { include: ["{packages,apps,tools}/*/test/**/*.test.ts"] },
  staged: { "*.{js,mjs,cjs,ts,tsx,json,jsonc,css,md,yml,yaml}": "vp check --fix" },
});
