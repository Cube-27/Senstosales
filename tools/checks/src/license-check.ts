// Contract C13 (docs/ARCHITECTURE.md §2): fail when a dependency's declared licence is on the deny-list.
// Usage: node tools/checks/src/license-check.ts <`pnpm licenses list --json --recursive` output>
// SPDX expressions are parsed with precedence (WITH > AND > OR, parentheses honoured) and identifiers matched whole,
// so LGPL never matches GPL. A missing or unknown licence is denied: it can't be shown to be clean.
import { readFileSync } from "node:fs";

const DENIED = new Set(
  [
    "AGPL-1.0",
    "AGPL-1.0-only",
    "AGPL-1.0-or-later",
    "AGPL-3.0",
    "AGPL-3.0-only",
    "AGPL-3.0-or-later",
    "GPL-1.0",
    "GPL-1.0-only",
    "GPL-1.0-or-later",
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
    "UNKNOWN",
    "UNLICENSED",
  ].map((id) => id.toLowerCase()),
);

// The deprecated `+` suffix ("GPL-2.0+") means "or later" and is judged as its base licence.
const isDeniedId = (id: string): boolean => DENIED.has(id.replace(/\+$/, "").toLowerCase());

type Cursor = { tokens: string[]; at: number };
const peek = (c: Cursor): string | undefined => c.tokens[c.at]?.toUpperCase();

/** Parses one OR-level expression and returns whether it is clean. */
function parseOr(c: Cursor): boolean {
  let clean = parseAnd(c);
  while (peek(c) === "OR") {
    c.at++;
    clean = parseAnd(c) || clean;
  }
  return clean;
}

function parseAnd(c: Cursor): boolean {
  let clean = parseTerm(c);
  while (peek(c) === "AND") {
    c.at++;
    clean = parseTerm(c) && clean;
  }
  return clean;
}

function parseTerm(c: Cursor): boolean {
  const token = c.tokens[c.at++];
  if (token === undefined) throw new Error("unexpected end of licence expression");
  if (token === "(") {
    const clean = parseOr(c);
    if (c.tokens[c.at++] !== ")") throw new Error("unbalanced parentheses in licence expression");
    return clean;
  }
  // `X WITH exception` is judged by X.
  if (peek(c) === "WITH") c.at += 2;
  return !isDeniedId(token);
}

/** Whether an SPDX licence expression is acceptable under the deny-list. Unparseable expressions are not clean. */
export function isClean(expression: string): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  if (tokens.length === 0) return false;
  const cursor = { tokens, at: 0 };
  try {
    const clean = parseOr(cursor);
    return cursor.at === tokens.length && clean;
  } catch {
    return false;
  }
}

/** Lines naming each denied package, from pnpm's `{ "<licence>": [{ name, versions }] }` report. */
export function deniedPackages(report: Record<string, Array<{ name: string; versions?: string[] }>>): string[] {
  return Object.entries(report)
    .filter(([licence]) => !isClean(licence))
    .flatMap(([licence, packages]) => packages.map((p) => `${p.name}@${(p.versions ?? []).join(",")}: ${licence}`));
}

function main(path: string | undefined): number {
  if (!path) {
    console.error("usage: node tools/checks/src/license-check.ts <licenses.json>");
    return 2;
  }
  const denied = deniedPackages(JSON.parse(readFileSync(path, "utf8")));
  for (const line of denied) console.error(`denied licence: ${line}`);
  return denied.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv[2]));
