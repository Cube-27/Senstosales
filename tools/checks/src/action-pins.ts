// INV-108 (docs/ARCHITECTURE.md §14.2; SPEC-00 §4.5): every GitHub Action is pinned to a full commit SHA, and each
// workflow defaults to read-only permissions. Scans every YAML file under .github: workflows get both rules,
// composite actions the pin rule. Files are parsed as YAML, so every way of writing a key or a map is covered.
// Prints `path:line rule` per finding.
// Usage: node tools/checks/src/action-pins.ts (from the repo root)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type Document, isMap, isScalar, LineCounter, parseDocument, visit } from "yaml";

type Finding = {
  line: number;
  rule: "action-not-pinned" | "invalid-yaml" | "no-default-permissions" | "permissions-not-read";
};
type LineOf = (node: unknown) => number;

// A local action, a docker image by digest, or owner/repo[/path]@<40-hex SHA>.
const PINNED = /^(?:\.\/.*|docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}|[^@\s]+@[0-9a-f]{40})$/;

const isKey = (node: unknown, key: string): boolean => isScalar(node) && node.value === key;

function pinFindings(doc: Document, lineOf: LineOf): Finding[] {
  const findings: Finding[] = [];
  visit(doc, {
    Pair(_, pair) {
      if (!isKey(pair.key, "uses")) return;
      const ref = isScalar(pair.value) ? String(pair.value.value) : "";
      if (!PINNED.test(ref)) findings.push({ line: lineOf(pair.key), rule: "action-not-pinned" });
    },
  });
  return findings;
}

/** The top-level `permissions` must be a map (`{}` allowed) whose every scope is `read` or `none`. */
function permissionFindings(doc: Document, lineOf: LineOf): Finding[] {
  const pair = isMap(doc.contents) ? doc.contents.items.find((p) => isKey(p.key, "permissions")) : undefined;
  if (pair === undefined) return [{ line: 0, rule: "no-default-permissions" }];
  const grants = pair.value;
  const readOnly =
    isMap(grants) &&
    grants.items.every((g) => isScalar(g.value) && (g.value.value === "read" || g.value.value === "none"));
  return readOnly ? [] : [{ line: lineOf(pair.key), rule: "permissions-not-read" }];
}

function check(text: string, workflow: boolean): Finding[] {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const lineAt = (offset: number): number => lineCounter.linePos(offset).line;
  const [error] = doc.errors;
  if (error !== undefined) return [{ line: lineAt(error.pos[0]), rule: "invalid-yaml" }];
  const lineOf: LineOf = (node) => (isScalar(node) && node.range ? lineAt(node.range[0]) : 0);
  return [...(workflow ? permissionFindings(doc, lineOf) : []), ...pinFindings(doc, lineOf)];
}

export const checkWorkflow = (text: string): Finding[] => check(text, true);

function main(): number {
  const files = existsSync(".github")
    ? readdirSync(".github", { recursive: true, encoding: "utf8" })
        .map((path) => join(".github", path).replaceAll("\\", "/"))
        .filter((path) => /\.ya?ml$/.test(path))
        .sort()
    : [];
  let count = 0;
  for (const path of files) {
    for (const f of check(readFileSync(path, "utf8"), path.startsWith(".github/workflows/"))) {
      console.error(`${path}:${f.line} ${f.rule}`);
      count++;
    }
  }
  console.log(`action-pins: ${count} finding(s) in ${files.length} file(s)`);
  return count === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
