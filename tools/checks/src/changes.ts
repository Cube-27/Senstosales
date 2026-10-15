// Which CI jobs a change needs (the `changes` job of ci.yml). A pull request that touches only documentation
// (`docs/**`, any `*.md`, `.claude/skills/**`) skips the code jobs; anything else, and every push, runs them all.
// Gated jobs are skipped by a job-level `if:`, so they still report and satisfy the required checks.
// Usage: node tools/checks/src/changes.ts [BASE HEAD] (from the repo root); without both, every job runs. Writes
// `code=true|false` to $GITHUB_OUTPUT when set, else to stdout.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const DOCS = /^(?:docs\/|\.claude\/skills\/)|\.md$/;

/** True unless every changed path is documentation; an empty list runs everything too. */
export const needsCode = (paths: readonly string[]): boolean => paths.length === 0 || !paths.every((p) => DOCS.test(p));

const SHA = /^[0-9a-f]{40}$/;

function changedPaths(base: string, head: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

if (import.meta.main) {
  const [base = "", head = ""] = process.argv.slice(2);
  const paths = SHA.test(base) && SHA.test(head) ? changedPaths(base, head) : [];
  const line = `code=${needsCode(paths)}\n`;
  const output = process.env["GITHUB_OUTPUT"];
  if (output) appendFileSync(output, line);
  else process.stdout.write(line);
}
