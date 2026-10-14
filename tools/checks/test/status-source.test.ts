import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { statusViolations } from "../src/status-source.ts";

const SOURCE = "packages/db/src/po.ts";

describe("statusViolations", () => {
  it.each([
    // A function named for item or PO status, in any declaration form and casing.
    ["function poStatus(items) {", "status function poStatus"],
    ["export function itemStatus(input: ItemStatusInput): ItemStatus {", "status function itemStatus"],
    ["export async function computePoStatus(id: string) {", "status function computePoStatus"],
    ["const deriveItemStatus = (row: Row) => row.state;", "status function deriveItemStatus"],
    ["export const getPOStatus = async (id) => load(id);", "status function getPOStatus"],
    ["let po_status = function (rows) {", "status function po_status"],
    ["const ItemStatus = ({ row }: Props) => <span>{row.status}</span>;", "status function ItemStatus"],
    ["  private recomputeItemStatus(row: Row): void {", "status function recomputeItemStatus"],
    // A status value produced by a decision: return, arrow, ternary branch, assignment, SQL CASE.
    ['  return "Delivered";', 'status value "Delivered"'],
    ["const s = (r) => 'Closed';", 'status value "Closed"'],
    ['const s = gte(rcd, ord) ? "Closed" : other;', 'status value "Closed"'],
    ['status = "Pending";', 'status value "Pending"'],
    ["  if (row.cancelled) return `Cancelled`;", 'status value "Cancelled"'],
    ["CASE WHEN rcd_qty_m >= ord_qty_m THEN 'Closed' ELSE 'Pending' END", 'status value "Closed"'],
    ["  when rcd_qty_m >= ord_qty_m then 'Closed'", 'status value "Closed"'],
  ])("flags %s", (line, message) => {
    expect(statusViolations(SOURCE, `// header\n${line}\n`)).toEqual([`${SOURCE}:2 ${message} (INV-64)`]);
  });

  it.each([
    // Consumers import and call the one implementation, compare its result, or list the values.
    'import { itemStatus, poStatus } from "@senstosales/domain";',
    "const status = poStatus(items.map(itemStatus));",
    '  if (status === "Closed") return tone.done;',
    'if (status !== "Delivered") badge = tone;',
    '  case "Pending":',
    'export const STATUS_FILTER = ["Pending", "Delivered", "Closed"];',
    "const badge = { Pending: 'warning', Closed: 'success' };",
    "  itemStatuses: readonly ItemStatus[],",
    "type Row = { status: ItemStatus };",
    // Other statuses are not item or PO status.
    "function jobStatus(job: Job) {",
    "const repoStatus = () => git.status();",
    "const httpStatus = (res) => res.status;",
    'return "pending";',
    "const PoStatusBadge = ({ status }: Props) => <Badge tone={TONE[status]} />;",
    // Comments never derive anything.
    '// return "Closed" once every item is received',
    " * function poStatus(items) is in packages/domain",
  ])("accepts %s", (line) => {
    expect(statusViolations(SOURCE, `${line}\n`)).toEqual([]);
  });

  it("exempts packages/domain/src/status.ts, the one implementation", () => {
    expect(
      statusViolations("packages/domain/src/status.ts", 'export function poStatus() {\n  return "Closed";\n}\n'),
    ).toEqual([]);
  });

  it.each(["packages/domain/test/status.test.ts", "tools/checks/src/x.ts", "apps/web/src/styles.css"])(
    "skips %s, which is not production TypeScript",
    (path) => {
      expect(statusViolations(path, 'function poStatus() { return "Closed"; }\n')).toEqual([]);
    },
  );

  it("scans apps sources and .tsx files", () => {
    expect(statusViolations("apps/web/src/Po.tsx", 'const s = done ? "Closed" : "Pending";\n')).toEqual([
      'apps/web/src/Po.tsx:1 status value "Closed" (INV-64)',
    ]);
  });
});

describe("status-source CLI", () => {
  const repo = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), "status-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    execFileSync("git", ["add", "-A"], { cwd: dir });
    return dir;
  };
  const run = (cwd: string): { status: number | null; stderr: string } => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "../src/status-source.ts")], { cwd });
    rmSync(cwd, { recursive: true, force: true });
    return { status: result.status, stderr: result.stderr.toString() };
  };
  const STATUS_TS = 'export function poStatus(s: string[]) {\n  return s.length ? "Pending" : "Closed";\n}\n';

  it("fails on a status function planted outside status.ts and names it", () => {
    const planted = 'export function poStatus(rows: Row[]) {\n  return rows.every(done) ? "Closed" : "Pending";\n}\n';
    expect(run(repo({ "packages/domain/src/status.ts": STATUS_TS, "packages/db/src/po-status.ts": planted }))).toEqual({
      status: 1,
      stderr:
        "packages/db/src/po-status.ts:1 status function poStatus (INV-64)\n" +
        'packages/db/src/po-status.ts:2 status value "Closed" (INV-64)\n',
    });
  });

  it("passes when only status.ts derives status", () => {
    const consumer = 'import { poStatus } from "@senstosales/domain";\nexport const s = poStatus([]);\n';
    expect(run(repo({ "packages/domain/src/status.ts": STATUS_TS, "packages/db/src/po.ts": consumer }))).toEqual({
      status: 0,
      stderr: "",
    });
  });
});
