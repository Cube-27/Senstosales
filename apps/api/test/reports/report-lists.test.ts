// SPEC-13 PR 5: the /reports tab lists over the report dataset (today 2025-06-01). Each list's rows are the rows its
// export writes: checked against the legacy-derived goldens column by column, and against the service's export rows.
import type { NodeDb } from "@senstosales/db/node";
import { RANGE } from "@senstosales/documents/test/reports/dataset";
import type { IsoDate } from "@senstosales/domain";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { reportsService } from "../../src/services/reports.ts";
import { fixedClock } from "../service-deps.ts";
import { reportDb, reportIds } from "./dataset-db.ts";
import { routesOver } from "../seed-rows.ts";
import { workbookGoldenFile } from "./golden.ts";

let db: NodeDb;
let send: ReturnType<typeof routesOver>;
beforeEach(async () => {
  db = await reportDb();
  send = routesOver(db);
});
afterEach(() => db.close());

const range = `from=${RANGE.from}&to=${RANGE.to}`;

async function list<T>(path: string) {
  const res = await send(path);
  expect(res.status).toBe(200);
  return (await res.json()) as { items: T[]; total: number };
}

const goldenRows = (file: string) =>
  workbookGoldenFile(file).rows.map((row) => row.map((c) => (c !== null && typeof c === "object" ? c.v : c)));

interface DocRef {
  number: string;
}

interface PendingRow {
  poNumber: string;
  poItemNo: number;
  description: string;
  unit: string;
  ordQty: string;
  dspQty: string;
  gemcNumbers: string[];
  dcs: DocRef[];
  invoices: DocRef[];
}

interface ReconciliationRow {
  poNumber: string;
  poItemNo: number;
  poDate: string;
  description: string;
  ordQty: string;
  dspQty: string;
  rcdQty: string;
  rejQty: string;
  balanceQty: string;
}

const numbers = (refs: DocRef[]) => refs.map((r) => r.number).join(",");

describe("GET /api/reports/pending", () => {
  it("lists the items dated in the range with quantity to supply, as the pending golden's rows", async () => {
    const { items, total } = await list<PendingRow>(`/api/reports/pending?${range}`);
    expect(total).toBe(2);
    // The golden's columns but the description, whose repeated lines only the workbook folds.
    const golden = goldenRows("pending.json").slice(9, -1);
    expect(
      items.map((r, i) => [
        i + 1,
        `${r.ordQty} ${r.unit}`,
        0,
        r.poNumber,
        r.gemcNumbers.join(","),
        numbers(r.invoices),
        numbers(r.dcs),
        Number(r.dspQty),
      ]),
    ).toEqual(golden.map((row) => row.filter((_, c) => c !== 1)));
    expect(items.map((r) => r.description)).toEqual(["Hex bolt M10", "Gasket set\nGasket set\nSize 50"]);
  });

  it("carries each item's documents with their FY", async () => {
    const { items } = await list<PendingRow>(`/api/reports/pending?${range}`);
    expect(items[0]).toMatchObject({
      poItemId: reportIds.item.A10,
      poId: reportIds.po.A,
      poDate: "2025-04-02",
      dcs: [
        { id: reportIds.dc["101"], number: "101", date: "2025-04-25", financialYear: "2025-26" },
        { id: reportIds.dc["102"], number: "102", date: "2025-05-10", financialYear: "2025-26" },
      ],
      invoices: [{ id: reportIds.invoice["201"], number: "201", date: "2025-04-26", financialYear: "2025-26" }],
    });
  });

  it.each([
    ["", ["4500101", "4500102"]],
    ["from=2025-04-10", ["4500102"]],
    ["to=2025-04-10", ["4500101"]],
    ["sort=dspQty&dir=asc", ["4500102", "4500101"]],
    ["sort=poDate&dir=desc", ["4500102", "4500101"]],
    ["sort=description&dir=asc", ["4500102", "4500101"]],
  ])("%s", async (query, expected) => {
    const { items } = await list<PendingRow>(`/api/reports/pending?${query}`);
    expect(items.map((r) => r.poNumber)).toEqual(expected);
  });
});

describe("GET /api/reports/reconciliation", () => {
  const asCells = (r: ReconciliationRow) => [
    r.poNumber,
    r.poItemNo,
    r.poDate,
    r.description,
    ...[r.ordQty, r.dspQty, r.rcdQty, r.rejQty, r.balanceQty].map(Number),
  ];

  it("lists the items of the POs dated in the range, newest PO first, as the reconciliation golden", async () => {
    const { items, total } = await list<ReconciliationRow>(`/api/reports/reconciliation?${range}`);
    expect(total).toBe(4);
    expect(items.map(asCells)).toEqual(goldenRows("reconciliation.json").slice(1));
  });

  it("lists one PO's items whatever the range (EC-42)", async () => {
    const { items } = await list<ReconciliationRow>(
      `/api/reports/reconciliation?poId=${reportIds.po.A}&from=2025-06-01&to=2025-06-01`,
    );
    expect(items.map(asCells)).toEqual(goldenRows("reconciliation-one-po.json").slice(1));
  });

  it.each(["", "from=2025-03-01", "to=2025-05-31"])(
    "without both range ends, lists the POs of the 30 days to today, as legacy: %s",
    async (query) => {
      // 2025-05-02 to 2025-06-01 holds no PO date in the dataset.
      expect(await list(`/api/reports/reconciliation?${query}`)).toEqual({ items: [], total: 0 });
    },
  );

  it("sorts and pages", async () => {
    const { items, total } = await list<ReconciliationRow>(
      `/api/reports/reconciliation?${range}&sort=rejQty&dir=desc&pageSize=10`,
    );
    expect(total).toBe(4);
    expect(items.map((r) => `${r.poNumber}/${r.poItemNo}`)).toEqual([
      "4500101/20",
      "4500102/10",
      "4500101/10",
      "4500103/10",
    ]);
    expect(await list(`/api/reports/reconciliation?${range}&page=2`)).toEqual({ items: [], total: 4 });
  });

  it("rejects a sort the tab does not have", async () => {
    const res = await send("/api/reports/reconciliation?sort=poDate");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid-input", details: { fields: [{ path: "query.sort" }] } });
  });
});

describe("list rows are export rows", () => {
  const services = () => reportsService({ db, clock: fixedClock });
  const all = async <T>(rows: AsyncIterable<T>) => {
    const out: T[] = [];
    for await (const row of rows) out.push(row);
    return out;
  };
  const from = RANGE.from as IsoDate;
  const to = RANGE.to as IsoDate;

  it.each([
    { from, to, dir: "asc" as const },
    { dir: "desc" as const, sort: "ordQty" as const },
  ])("pending %o", async (query) => {
    const reports = services();
    const pages = await reports.pending({ ...query, page: 1, pageSize: 100 });
    expect(pages.items).toEqual(await all(reports.pendingRows(query)));
  });

  it.each([
    { from, to, dir: "asc" as const },
    { poId: reportIds.po.A, dir: "desc" as const, sort: "description" as const },
  ])("reconciliation %o", async (query) => {
    const reports = services();
    const pages = await reports.reconciliation({ ...query, page: 1, pageSize: 100 });
    expect(pages.items).toEqual(await all(reports.reconciliationRows(query)));
  });
});
