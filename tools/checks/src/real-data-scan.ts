// Contract C1 (docs/ARCHITECTURE.md §2, §14.3): no real data in this public repo. Scans every tracked file and fails
// on GSTIN-shaped strings, local data paths, database files and (optionally) a hashed denylist of real identifiers.
// Reports `path:line rule` only, never the matched text, so CI logs don't leak what they catch.
// A documented synthetic test literal may carry the marker `real-data-scan: allow` on its own line.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export type Finding = { path: string; line: number; rule: string };

const ALLOW_MARKER = "real-data-scan: allow";
const LINE_RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "gstin", pattern: /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/ },
  { rule: "local-data-path", pattern: /[A-Za-z]:[\\/]+(?:Users[\\/]+[^\\/\s]+[\\/]+)?Downloads\b/i },
  { rule: "local-data-path", pattern: /\bbusiness\.db\b|\bbusiness_development\b/i },
];
const FILE_RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "database-file", pattern: /\.(?:db|sqlite3?|db-wal|db-shm)$/i },
];
const TOKEN = /[A-Za-z0-9]{4,}/g;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Hashes of real identifiers, one lowercase hex SHA-256 per line (CI secret `REAL_DATA_DENYLIST`). */
export function parseDenylist(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(/\s+/)
      .map((h) => h.trim().toLowerCase())
      .filter((h) => /^[0-9a-f]{64}$/.test(h)),
  );
}

function scanLine(line: string, denylist: ReadonlySet<string>): string | undefined {
  if (line.includes(ALLOW_MARKER)) return undefined;
  const hit = LINE_RULES.find(({ pattern }) => pattern.test(line));
  if (hit) return hit.rule;
  if (denylist.size === 0) return undefined;
  const tokens = line.match(TOKEN) ?? [];
  return tokens.some((t) => denylist.has(sha256(t.toLowerCase()))) ? "denylisted-identifier" : undefined;
}

export function scanFile(path: string, content: string, denylist: ReadonlySet<string>): Finding[] {
  const fileRule = FILE_RULES.find(({ pattern }) => pattern.test(path));
  if (fileRule) return [{ path, line: 0, rule: fileRule.rule }];
  const findings: Finding[] = [];
  content.split(/\r?\n/).forEach((text, index) => {
    const rule = scanLine(text, denylist);
    if (rule) findings.push({ path, line: index + 1, rule });
  });
  return findings;
}

const isBinary = (buffer: Buffer): boolean => buffer.subarray(0, 8000).includes(0);

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
}

function main(): number {
  const denylist = parseDenylist(process.env["REAL_DATA_DENYLIST"]);
  const findings = trackedFiles().flatMap((path) => {
    const buffer = readFileSync(path);
    const content = isBinary(buffer) ? "" : buffer.toString("utf8");
    return scanFile(path, content, denylist);
  });
  for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule}`);
  console.log(`real-data-scan: ${findings.length} finding(s)${denylist.size ? "" : " (no denylist configured)"}`);
  return findings.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
