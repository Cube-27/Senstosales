// Contract C1 (docs/ARCHITECTURE.md §2, §14.3; SPEC-00 §4.6): no real data in this public repo. Scans tracked files
// (default) or staged files (`--staged`) and fails on GSTIN-shaped strings, Indian mobile numbers, local data paths,
// database files, HTML or binary documents outside their fixture folders, and, when the gitignored
// tools/checks/company-details.local.txt exists (the hook and local `pnpm verify`; never CI), any of its values.
// Reports `path:line rule` only, never the matched text, so CI logs don't leak it.
// Exceptions live in tools/checks/real-data-allow.txt as `path:rule  # justification`; there is no inline marker.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Finding = { path: string; line: number; rule: string };

const LINE_RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  // Any case, and bounded by non-alphanumerics rather than \b, so `id_<GSTIN>` and lowercase copies are caught.
  { rule: "gstin", pattern: /(?<![0-9A-Z])\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z](?![0-9A-Z])/i },
  // Optional +91 or 0 prefix, then 10 digits starting 6-9, bounded by non-digits.
  { rule: "mobile", pattern: /(?<!\d)(?:\+91|0)?[6-9]\d{9}(?!\d)/ },
  // A Downloads folder, or any absolute path under a named user profile (Windows, Linux, macOS).
  { rule: "local-data-path", pattern: /\b[a-z]:[\\/]+(?:Users[\\/]+[^\\/\s"'`]+|[^\\/\s"'`]*Downloads\b)/i },
  { rule: "local-data-path", pattern: /(?:^|[\s"'`(=])\/(?:home|Users)\/[^/\s"'`]+\//i },
  { rule: "local-data-path", pattern: /\bbusiness\.db\b|\bbusiness_development\b/i },
  // The owner's private data folder beside this repo; only CLAUDE.md names it, to forbid reading it.
  { rule: "private-repo-path", pattern: /\bSenstoSales-private\b/i },
];
// Same extensions as the database block in .gitignore; this catches files force-added past it.
const DATABASE_FILE = /\.(?:db|sqlite3?|db-wal|db-shm)$/i;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");
const HTML_FILE = /\.html?$/i;
const HTML_FIXTURE_DIRS = /^packages\/(?:parsers|scraper)\/fixtures\//;
// Binary documents can't be line-scanned, so they are allowed only where the de-branded templates and export goldens
// live (SPEC-12, SPEC-13); their contents are not scanned and review keeps real data out of them (D-0010).
const DOCUMENT_FILE = /\.(?:xlsx|xlsm|xls|docx|doc|pdf|zip)$/i;
const DOCUMENT_DIRS = /^packages\/documents\/(?:templates|test)\//;
// Whole-file rules, checked in order; the first match is the file's only finding.
const PATH_RULES: ReadonlyArray<{ rule: string; test: (path: string, head: Buffer) => boolean }> = [
  {
    rule: "database-file",
    test: (path, head) => DATABASE_FILE.test(path) || head.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER),
  },
  { rule: "html-outside-fixtures", test: (path) => HTML_FILE.test(path) && !HTML_FIXTURE_DIRS.test(path) },
  { rule: "document-outside-fixtures", test: (path) => DOCUMENT_FILE.test(path) && !DOCUMENT_DIRS.test(path) },
];
const COMPANY_DETAILS = "company-details";
const RULES = new Set([...[...LINE_RULES, ...PATH_RULES].map(({ rule }) => rule), COMPANY_DETAILS]);
const ALLOWLIST_PATH = "tools/checks/real-data-allow.txt";
const COMPANY_DETAILS_PATH = "tools/checks/company-details.local.txt";
const ALLOW_ENTRY = /^(\S+):(\S+)\s+#\s*\S/;

/** Parses `path:rule  # justification` lines; blank and comment lines are ignored, a malformed line throws. */
export function parseAllowlist(text: string): ReadonlySet<string> {
  const entries = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const [, path, rule = ""] = ALLOW_ENTRY.exec(line) ?? [];
    if (!RULES.has(rule)) {
      throw new Error(`${ALLOWLIST_PATH}:${index + 1}: expected "path:rule  # justification" with a known rule`);
    }
    entries.add(`${path}:${rule}`);
  });
  return entries;
}

/** The company-details values: one per non-blank line, trimmed and lowercased for case-insensitive matching. */
export function parseCompanyDetails(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
}

/** The file as text (UTF-8, or UTF-16 with a byte-order mark, as Excel saves CSV), or undefined when binary. */
function decode(content: Buffer): string | undefined {
  if (content[0] === 0xff && content[1] === 0xfe) return content.subarray(2).toString("utf16le");
  if (content[0] === 0xfe && content[1] === 0xff)
    return Buffer.from(content.subarray(2, content.length - (content.length % 2)))
      .swap16()
      .toString("utf16le");
  return content.subarray(0, 8000).includes(0) ? undefined : content.toString("utf8");
}

/**
 * Every distinct rule one line of text breaks, so allowlisting one rule for a file can't hide another on the same
 * line. `companyDetails` comes from parseCompanyDetails.
 */
export function lineRules(text: string, companyDetails: readonly string[] = []): Set<string> {
  const rules = new Set(LINE_RULES.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => rule));
  if (companyDetails.length > 0) {
    const lower = text.toLowerCase();
    if (companyDetails.some((value) => lower.includes(value))) rules.add(COMPANY_DETAILS);
  }
  return rules;
}

/** Findings for one file, before the allowlist is applied. `companyDetails` comes from parseCompanyDetails. */
export function scanFile(path: string, content: Buffer, companyDetails: readonly string[] = []): Finding[] {
  const pathRule = PATH_RULES.find(({ test }) => test(path, content));
  if (pathRule) return [{ path, line: 0, rule: pathRule.rule }];
  const decoded = decode(content);
  if (decoded === undefined) return [];
  return decoded
    .split(/\r?\n/)
    .flatMap((text, index) => [...lineRules(text, companyDetails)].map((rule) => ({ path, line: index + 1, rule })));
}

/** The values of `<root>/tools/checks/company-details.local.txt`, or none when the file is absent (CI, forks). */
export function readCompanyDetails(root: string): string[] {
  const path = join(root, COMPANY_DETAILS_PATH);
  return existsSync(path) ? parseCompanyDetails(readFileSync(path, "utf8")) : [];
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

/** The allowlist being checked: with `staged`, the index copy (empty if none is staged), so an unstaged edit can't
 * excuse a staged file; else the working-tree file. */
function readAllowlist(staged: boolean): string {
  if (!staged) return readFileSync(ALLOWLIST_PATH, "utf8");
  const inIndex = git(["ls-files", "-z", "--", ALLOWLIST_PATH]).length > 0;
  return inIndex ? git(["show", `:${ALLOWLIST_PATH}`]).toString("utf8") : "";
}

function main(argv: string[]): number {
  const staged = argv.includes("--staged");
  const allow = parseAllowlist(readAllowlist(staged));
  const companyDetails = readCompanyDetails(".");
  const findings = applyAllowlist(
    selectFiles(staged).flatMap((f) => scanFile(f.path, f.read(), companyDetails)),
    allow,
  );
  for (const f of findings) console.error(`${f.path}:${f.line} ${f.rule}`);
  console.log(`real-data-scan: ${findings.length} finding(s)`);
  return findings.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
