// The corpus import report (SPEC-09 §2): what happened to every page, from the two folder-import job summaries and
// the pages too large to send, plus totals read from the imported database. It holds real identifiers and counts, so
// it is written only outside the repo and never pasted into a PR, issue or log (§4.2, C1).
import { existsSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { type Db, po, reconciliationIssue, srv } from "@senstosales/db";
import { zFlagType, zPoStatus } from "@senstosales/schemas";
import { count, isNull } from "drizzle-orm";
import { z } from "zod";

import type { CorpusImport, KindImport } from "./import.ts";

type FlagType = z.infer<typeof zFlagType>;
type PoStatus = z.infer<typeof zPoStatus>;

/** A page the import skipped or failed, with the reason the job gave. */
export interface PageIssue {
  readonly file: string;
  readonly reason: string;
}

export interface KindReport {
  /** How the folder-import job ended, and its error when the whole job failed. */
  readonly job: { readonly status: string; readonly error: string | null };
  /** Every page found in the folder, sent or not. */
  readonly pages: number;
  readonly accepted: number;
  readonly skipped: readonly PageIssue[];
  readonly failed: readonly PageIssue[];
  /** Pages over the request cap, never sent, listed so none is dropped silently. */
  readonly tooLarge: readonly string[];
  /** The flags this job opened, by type. */
  readonly flagsOpened: Readonly<Record<FlagType, number>>;
}

/** What the imported database holds after both jobs. */
export interface CorpusTotals {
  readonly flagsByType: Readonly<Record<FlagType, number>>;
  readonly posByStatus: Readonly<Record<PoStatus, number>>;
  readonly srvsPoNotFound: number;
}

export interface ImportReport extends CorpusTotals {
  readonly passed: boolean;
  readonly po: KindReport;
  readonly srv: KindReport;
  /** Warnings and errors the services logged. */
  readonly logged: readonly string[];
}

const zDocumentIssue = z.object({ document: z.string(), reason: z.string() });

/** The part of a folder-import job summary the report reads, as the job worker and `finish` write it. `flags` is
 * left out when `finish` failed, which the run logs. */
const zFolderImportSummary = z.object({
  total: z.number(),
  done: z.number(),
  skippedDocuments: z.array(zDocumentIssue),
  failedDocuments: z.array(zDocumentIssue),
  flags: z.partialRecord(zFlagType, z.number()).default({}),
});

/** The count of every value of `keys`, 0 where none was counted, so the record lists every key. */
const countsOf = <K extends string>(keys: readonly K[], counted: Partial<Record<K, number>>) =>
  Object.fromEntries(keys.map((key) => [key, counted[key] ?? 0])) as Record<K, number>;

function byKey<K extends string>(rows: readonly { key: K; count: number }[]): Partial<Record<K, number>> {
  const counted: Partial<Record<K, number>> = {};
  for (const row of rows) counted[row.key] = row.count;
  return counted;
}

/** Flags by type, POs by status and SRVs whose PO is not in the system ("PO not found", INV-40). */
export async function readTotals(db: Db): Promise<CorpusTotals> {
  const [flags, pos, [notFound]] = await Promise.all([
    db.query(
      db.build
        .select({ key: reconciliationIssue.type, count: count() })
        .from(reconciliationIssue)
        .groupBy(reconciliationIssue.type),
    ),
    db.query(db.build.select({ key: po.status, count: count() }).from(po).groupBy(po.status)),
    db.query(db.build.select({ count: count() }).from(srv).where(isNull(srv.poId))),
  ]);
  return {
    flagsByType: countsOf(zFlagType.options, byKey(flags)),
    posByStatus: countsOf(zPoStatus.options, byKey(pos)),
    srvsPoNotFound: notFound?.count ?? 0,
  };
}

function kindReport({ job, tooLarge }: KindImport): KindReport {
  const summary = zFolderImportSummary.parse(job.summary);
  const issues = (documents: z.infer<typeof zDocumentIssue>[]) =>
    documents.map(({ document, reason }) => ({ file: document, reason }));
  return {
    job: { status: job.status, error: job.error },
    pages: summary.total + tooLarge.length,
    accepted: summary.done,
    skipped: issues(summary.skippedDocuments),
    failed: issues(summary.failedDocuments),
    tooLarge,
    flagsOpened: countsOf(zFlagType.options, summary.flags),
  };
}

export function buildReport(run: CorpusImport): ImportReport {
  return {
    passed: run.passed,
    po: kindReport(run.po),
    srv: kindReport(run.srv),
    ...run.totals,
    logged: run.logged,
  };
}

const KINDS = [
  ["po", "PO"],
  ["srv", "SRV"],
] as const;

/** A bullet per line, or "None." */
const bullets = (lines: readonly string[]) => (lines.length === 0 ? ["None."] : lines.map((line) => `- ${line}`));

function pageList(report: ImportReport, pick: (kind: KindReport) => readonly string[]): string[] {
  return bullets(KINDS.flatMap(([key, label]) => pick(report[key]).map((line) => `${label}: ${line}`)));
}

const issueLines = (issues: readonly PageIssue[]) => issues.map(({ file, reason }) => `${file}: ${reason}`);

export function renderMarkdown(report: ImportReport): string {
  const kinds = KINDS.map(([key, label]) => ({ label, kind: report[key] }));
  const lines = [
    "# Corpus import report",
    "",
    `Result: ${report.passed ? "passed" : "failed"}`,
    "",
    ...kinds.map(({ label, kind }) => {
      const error = kind.job.error ? ` (${kind.job.error})` : "";
      return `${label} job: ${kind.job.status}${error}`;
    }),
    "",
    "## Pages",
    "",
    "| Kind | Pages | Accepted | Skipped | Failed | Too large |",
    "| ---- | ----- | -------- | ------- | ------ | --------- |",
    ...kinds.map(
      ({ label, kind: k }) =>
        `| ${label} | ${k.pages} | ${k.accepted} | ${k.skipped.length} | ${k.failed.length} | ${k.tooLarge.length} |`,
    ),
    "",
    "## Skipped pages",
    "",
    ...pageList(report, (kind) => issueLines(kind.skipped)),
    "",
    "## Failed pages",
    "",
    ...pageList(report, (kind) => issueLines(kind.failed)),
    "",
    "## Pages too large to send (over 10 MB)",
    "",
    ...pageList(report, (kind) => kind.tooLarge),
    "",
    "## Flags by type",
    "",
    "| Type | Opened by the PO import | Opened by the SRV import | In the database |",
    "| ---- | ----------------------- | ------------------------ | --------------- |",
    ...zFlagType.options.map(
      (type) =>
        `| ${type} | ${report.po.flagsOpened[type]} | ${report.srv.flagsOpened[type]} | ${report.flagsByType[type]} |`,
    ),
    "",
    "## POs by status",
    "",
    "| Status | POs |",
    "| ------ | --- |",
    ...zPoStatus.options.map((status) => `| ${status} | ${report.posByStatus[status]} |`),
    "",
    '## SRVs with "PO not found"',
    "",
    String(report.srvsPoNotFound),
    "",
    "## Logged warnings and errors",
    "",
    ...bullets(report.logged),
  ];
  return `${lines.join("\n")}\n`;
}

export const renderJson = (report: ImportReport): string => `${JSON.stringify(report, null, 2)}\n`;

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The real path of `path`, through its nearest existing ancestor when it does not exist yet. */
const realPath = (path: string): string =>
  existsSync(path) ? realpathSync(path) : join(realPath(dirname(resolve(path))), basename(path));

/** Refuses a report folder inside the repo, also through a link: the report holds real data (C1). */
export function assertOutsideRepo(dir: string): void {
  const path = relative(realPath(REPO), realPath(dir));
  if (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) {
    throw new Error("SENSTO_REPORT_DIR is inside the repository. Choose a folder outside it.");
  }
}

/** Writes `import-report.md` and `import-report.json` into `dir` and returns the markdown file's path. */
export async function writeReport(report: ImportReport, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const markdown = join(dir, "import-report.md");
  await Promise.all([
    writeFile(markdown, renderMarkdown(report)),
    writeFile(join(dir, "import-report.json"), renderJson(report)),
  ]);
  return markdown;
}
