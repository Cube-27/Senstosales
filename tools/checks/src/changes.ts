// Which CI jobs a change needs (the `changes` job of ci.yml). A pull request that touches only documentation
// (`docs/**`, any `*.md`, `.claude/skills/**`) skips the code jobs; anything else, and every push, runs them all.
// Gated jobs are skipped by a job-level `if:`, so they still report and satisfy the required checks.
// Usage: git diff --name-only BASE...HEAD | node tools/checks/src/changes.ts; no paths on stdin runs every job.
// Writes `code=true|false` to $GITHUB_OUTPUT when set, else to stdout.
import { appendFileSync, readFileSync } from "node:fs";

const DOCS = /^(?:docs\/|\.claude\/skills\/)|\.md$/;

/** True unless every changed path is documentation; an empty list runs everything too. */
export const needsCode = (paths: readonly string[]): boolean => paths.length === 0 || !paths.every((p) => DOCS.test(p));

if (import.meta.main) {
  const paths = readFileSync(0, "utf8").split("\n").filter(Boolean);
  const line = `code=${needsCode(paths)}\n`;
  const output = process.env["GITHUB_OUTPUT"];
  if (output) appendFileSync(output, line);
  else process.stdout.write(line);
}
