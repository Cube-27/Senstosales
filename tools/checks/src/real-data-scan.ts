// Contract C1 (docs/ARCHITECTURE.md §2, §14.3; SPEC-00 §4.6): no real data in this public repo. Scans tracked files
// (default) or staged files (`--staged`) and fails on GSTIN-shaped strings, local data paths, database files and HTML
// outside the fixture folders. Reports `path:line rule` only, never the matched text, so CI logs don't leak it.
// Exceptions live in tools/checks/real-data-allow.txt as `path:rule  # justification`; there is no inline marker.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export type Finding = { path: string; line: number; rule: string };

const LINE_RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "gstin", pattern: /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/ },
  // A Downloads folder, or any absolute path under a named user profile (Windows, Linux, macOS).
  { rule: "local-data-path", pattern: /\b[A-Za-z]:[\\/]+(?:Users[\\/]+[^\\/\s"'`]+|[^\\/\s"'`]*Downloads\b)/i },
  { rule: "local-data-path", pattern: /(?:^|[\s"'`(=])\/(?:home|Users)\/[^/\s"'`]+\//i },
  { rule: "local-data-path", pattern: /\bbusiness\.db\b|\bbusiness_development\b/i },
];
// Same extensions as the database block in .gitignore; this catches files force-added past it.
const DATABASE_FILE = /\.(?:db|sqlite3?|db-wal|db-shm)$/i;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");
const HTML_FILE = /\.html?$/i;
const HTML_FIXTURE_DIRS = /^packages\/(?:parsers|scraper)\/fixtures\//;
const ALLOWLIST_PATH = "tools/checks/real-data-allow.txt";

/** Parses `path:rule  # justification` lines; blank lines and comment lines are ignored. */
export function parseAllowlist(text: string): ReadonlySet<string> {
  const entries = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
  return new Set(entries);
}

function pathRule(path: string, head: Buffer): string | undefined {
  if (DATABASE_FILE.test(path) || head.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) return "database-file";
  if (HTML_FILE.test(path) && !HTML_FIXTURE_DIRS.test(path)) return "html-outside-fixtures";
  return undefined;
}

const isBinary = (content: Buffer): boolean => content.subarray(0, 8000).includes(0);

/** Findings for one file, before the allowlist is applied. */
export function scanFile(path: string, content: Buffer): Finding[] {
  const rule = pathRule(path, content);
  if (rule) return [{ path, line: 0, rule }];
  if (isBinary(content)) return [];
  const findings: Finding[] = [];
  content
    .toString("utf8")
    .split(/\r?\n/)
    .forEach((text, index) => {
      const hit = LINE_RULES.find(({ pattern }) => pattern.test(text));
      if (hit) findings.push({ path, line: index + 1, rule: hit.rule });
    });
  return findings;
}

export function applyAllowlist(findings: Finding[], allow: ReadonlySet<string>): Finding[] {
  return findings.filter((f) => !allow.has(`${f.path}:${f.rule}`));
}

const git = (args: string[]): Buffer => execFileSync("git", args, { maxBuffer: 1 << 30 });

/** The files to scan: tracked files, or staged added/copied/modified/renamed files (read from the index). */
export function selectFiles(staged: boolean): Array<{ path: string; read: () => Buffer }> {
  const list = staged ? git(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]) : git(["ls-files", "-z"]);
  return list
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => ({ path, read: () => (staged ? git(["show", `:${path}`]) : readFileSync(path)) }));
}

function main(argv: string[]): number {
  const allow = parseAllowlist(readFileSync(ALLOWLIST_PATH, "utf8"));
  const findings = applyAllowlist(
    selectFiles(argv.includes("--staged")).flatMap((f) => scanFile(f.path, f.read())),
    allow,
  );
  for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule}`);
  console.log(`real-data-scan: ${findings.length} finding(s)`);
  return findings.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
