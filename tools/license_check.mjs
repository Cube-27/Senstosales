// Fail when a dependency's declared licence is on the deny-list.
// Usage: node tools/license_check.mjs <pnpm licenses list --json output>
// Matches SPDX identifiers whole, never by substring, so LGPL does not match GPL. In an expression, `OR` passes when
// any branch is clean, `AND` needs every operand clean, and `WITH` judges the licence it modifies.
// Exit status: 0 when nothing is denied; 1 otherwise, with one stderr line per denied package.
import { readFileSync } from "node:fs";

const DENIED = new Set(
  [
    "AGPL-3.0",
    "AGPL-3.0-only",
    "AGPL-3.0-or-later",
    "GPL-2.0",
    "GPL-2.0-only",
    "GPL-2.0-or-later",
    "GPL-3.0",
    "GPL-3.0-only",
    "GPL-3.0-or-later",
    "SSPL-1.0",
    "CC-BY-NC-4.0",
    "CC-BY-NC-SA-4.0",
    "CC-BY-NC-ND-4.0",
    "PolyForm-Noncommercial-1.0.0",
    "Commons-Clause",
  ].map((id) => id.toLowerCase()),
);

const isDeniedId = (term) =>
  DENIED.has(
    term
      .split(/\s+WITH\s+/i)[0]
      .trim()
      .toLowerCase(),
  );
const isClean = (expression) =>
  expression
    .replace(/[()]/g, " ")
    .split(/\s+OR\s+/i)
    .some((branch) => branch.split(/\s+AND\s+/i).every((term) => !isDeniedId(term)));

const path = process.argv[2];
if (!path) {
  console.error("usage: node tools/license_check.mjs <licenses.json>");
  process.exit(2);
}
// pnpm groups packages by declared licence: { "<licence>": [{ name, versions }] }.
const report = JSON.parse(readFileSync(path, "utf8"));
const denied = Object.entries(report)
  .filter(([licence]) => !isClean(licence))
  .flatMap(([licence, packages]) => packages.map((p) => `${p.name}@${(p.versions ?? []).join(",")}: ${licence}`));
for (const line of denied) console.error(`denied licence: ${line}`);
process.exit(denied.length === 0 ? 0 : 1);
