// INV-108 (docs/ARCHITECTURE.md §14.2; SPEC-00 §4.5): every GitHub Action is pinned to a full commit SHA, and each
// workflow defaults to read-only permissions. Scans every YAML file under .github: workflows get both rules,
// composite actions the pin rule. Prints `path:line rule` per finding.
// Usage: node tools/checks/src/action-pins.ts (from the repo root)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Finding = { line: number; rule: "action-not-pinned" | "no-default-permissions" | "permissions-not-read" };

const USES = /^\s*(?:-\s+)?uses:\s*(["']?)([^\s"'#]+)\1/;
// A local action, a docker image by digest, or owner/repo[/path]@<40-hex SHA>.
const PINNED = /^(?:\.\/.*|docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}|[^@\s]+@[0-9a-f]{40})$/;

function checkPins(text: string): Finding[] {
  const findings: Finding[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const ref = USES.exec(line)?.[2];
    if (ref !== undefined && !PINNED.test(ref)) findings.push({ line: index + 1, rule: "action-not-pinned" });
  });
  return findings;
}

/** The top-level `permissions:` must exist, be non-empty and grant nothing beyond `read` (or `none`) per scope. */
function checkPermissions(text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("permissions:"));
  if (at === -1) return [{ line: 0, rule: "no-default-permissions" }];
  const inline = lines[at]
    ?.replace(/^permissions:/, "")
    .replace(/#.*/, "")
    .trim();
  const grants = [];
  if (inline) grants.push(inline === "{}" ? "none" : inline);
  for (const line of lines.slice(at + 1)) {
    // Blank and comment-only lines don't end the block in YAML; the next non-indented key does.
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (!/^\s/.test(line)) break;
    grants.push(line.replace(/#.*/, "").split(":")[1]?.trim() ?? "");
  }
  const readOnly = grants.length > 0 && grants.every((grant) => grant === "read" || grant === "none");
  return readOnly ? [] : [{ line: at + 1, rule: "permissions-not-read" }];
}

export const checkWorkflow = (text: string): Finding[] => [...checkPermissions(text), ...checkPins(text)];

function main(): number {
  const files = existsSync(".github")
    ? readdirSync(".github", { recursive: true, encoding: "utf8" })
        .map((path) => join(".github", path).replaceAll("\\", "/"))
        .filter((path) => /\.ya?ml$/.test(path))
        .sort()
    : [];
  let count = 0;
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    for (const f of path.startsWith(".github/workflows/") ? checkWorkflow(text) : checkPins(text)) {
      console.error(`${path}:${f.line} ${f.rule}`);
      count++;
    }
  }
  console.log(`action-pins: ${count} finding(s) in ${files.length} file(s)`);
  return count === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
