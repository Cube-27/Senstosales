// SPEC-13 PR 4: the pending-items, reconciliation and export-selected workbooks over the report dataset match their
// legacy-derived goldens (INV-68) cell for cell, with the catalog's file names; Accepted is the received quantity
// (INV-09) and only the balance is clamped (INV-61), as the goldens' worked values show.
import type { NodeDb } from "@senstosales/db/node";
import { RANGE } from "@senstosales/documents/test/reports/dataset";
import { downloadFileName } from "@senstosales/schemas";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { json, mostBoundParams } from "../helpers.ts";
import { id, q, routesOver, rows } from "../seed-rows.ts";
import { supplierDb } from "../service-deps.ts";
import { reportDb, reportIds } from "./dataset-db.ts";
import type { GoldenCell } from "./golden.ts";
import { workbookGolden, workbookGoldenFile } from "./golden.ts";

type Send = ReturnType<typeof routesOver>;

async function exported(send: Send, path: string, golden: string, init?: RequestInit) {
  const res = await send(path, init);
  expect(res.status).toBe(200);
  const { styles } = workbookGoldenFile(golden);
  return workbookGolden(new Uint8Array(await res.arrayBuffer()), downloadFileName(res), styles);
}

const values = (row: GoldenCell[]) => row.map((c) => (c !== null && typeof c === "object" ? c.v : c));
const range = `from=${RANGE.from}&to=${RANGE.to}`;
const selected = (...poIds: string[]) => json("POST", { poIds });

describe("over the report dataset", () => {
  let db: NodeDb;
  let send: Send;
  beforeEach(async () => {
    db = await reportDb();
    send = routesOver(db);
  });
  afterEach(() => db.close());

  describe("GET /api/reports/pending/export", () => {
    it("matches the golden: heading, items with a balance, TOTAL, print area, range in the file name", async () => {
      const golden = workbookGoldenFile("pending.json");
      expect(await exported(send, `/api/reports/pending/export?${range}`, "pending.json")).toEqual(golden);
    });

    it("without a full range is named Items_Summary.xlsx", async () => {
      for (const query of ["", "?from=2025-03-01"]) {
        const { fileName } = await exported(send, `/api/reports/pending/export${query}`, "pending.json");
        expect(fileName).toBe("Items_Summary.xlsx");
      }
    });

    it("totals with the unit when every row has the same one", async () => {
      const { rows: cells } = await exported(send, "/api/reports/pending/export?to=2025-04-10", "pending.json");
      expect(cells.slice(9).map(values)).toEqual([
        [1, "Hex bolt M10", "10 NOS", 0, "4500101", null, "201", "101,102", 9],
        ["TOTAL", null, "10 NOS", 0, null, null, null, null, null],
      ]);
    });

    it("keeps the tab's sort", async () => {
      const { rows: cells } = await exported(send, "/api/reports/pending/export?sort=dspQty&dir=asc", "pending.json");
      expect(cells.slice(9, -1).map((row) => values(row)[4])).toEqual(["4500102", "4500101"]);
    });

    it("with nothing pending, writes the heading, the header and a zero TOTAL", async () => {
      const golden = workbookGoldenFile("pending.json");
      const got = await exported(send, "/api/reports/pending/export?from=2026-01-01&to=2026-01-31", "pending.json");
      expect(got.fileName).toBe("Items_Summary_2026-01-01_to_2026-01-31.xlsx");
      expect(got.rows.slice(0, 9)).toEqual(golden.rows.slice(0, 9));
      expect(got.rows.slice(9).map(values)).toEqual([["TOTAL", null, 0, 0, null, null, null, null, null]]);
      expect(got.pageSetup["printArea"]).toBe("A1:I10");
      expect(got.merges).toEqual(["A3:I3", "A4:I4", "A5:I5", "A6:I6", "A10:B10"]);
    });

    it("rejects a malformed range before writing anything", async () => {
      expect((await send("/api/reports/pending/export?from=2025-02-30")).status).toBe(400);
    });
  });

  describe("GET /api/reports/reconciliation/export", () => {
    it("matches the golden for the range: newest PO first, Accepted = received, balance as stored", async () => {
      const golden = workbookGoldenFile("reconciliation.json");
      expect(await exported(send, `/api/reports/reconciliation/export?${range}`, "reconciliation.json")).toEqual(
        golden,
      );
    });

    it("matches the one-PO golden, named after the PO, whatever the range (EC-42)", async () => {
      const golden = workbookGoldenFile("reconciliation-one-po.json");
      const path = `/api/reports/reconciliation/export?poId=${reportIds.po.A}&from=2026-01-01&to=2026-01-31`;
      expect(await exported(send, path, "reconciliation-one-po.json")).toEqual(golden);
    });

    it("lists the rows the tab lists for the same filters and sort", async () => {
      const query = `${range}&sort=rejQty&dir=desc`;
      const { rows: cells } = await exported(send, `/api/reports/reconciliation/export?${query}`, "reconciliation.json");
      const res = await send(`/api/reports/reconciliation?${query}&pageSize=100`);
      const { items } = (await res.json()) as { items: { poNumber: string; poItemNo: number }[] };
      expect(cells.slice(1).map((row) => `${row[0]}/${row[1]}`)).toEqual(
        items.map((r) => `${r.poNumber}/${r.poItemNo}`),
      );
    });

    it("answers 404 for an unknown PO", async () => {
      const res = await send(`/api/reports/reconciliation/export?poId=${id("ZZ")}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: "po-not-found" });
    });
  });

  describe("POST /api/reports/export-selected", () => {
    it("matches the golden: the selected POs' items by PO number, then item number (EC-43)", async () => {
      const golden = workbookGoldenFile("export-selected.json");
      const body = selected(reportIds.po.C, reportIds.po.A);
      expect(await exported(send, "/api/reports/export-selected", "export-selected.json", body)).toEqual(golden);
    });

    it("writes a PO selected twice once and skips an unknown id", async () => {
      const golden = workbookGoldenFile("export-selected.json");
      const body = selected(reportIds.po.A, id("ZZ"), reportIds.po.C, reportIds.po.A);
      expect(await exported(send, "/api/reports/export-selected", "export-selected.json", body)).toEqual(golden);
    });

    it("rejects an empty selection", async () => {
      expect((await send("/api/reports/export-selected", selected())).status).toBe(400);
    });
  });
});

describe("pending rows the dataset does not have", () => {
  let db: NodeDb;
  let send: Send;
  beforeAll(async () => {
    db = await supplierDb();
    send = routesOver(db);
    const r = rows(db);
    await db.batch([
      r.po({ id: id("P1"), poNumber: "4600001", poDate: "2025-04-01" }),
      // No description: the material code, as legacy. No unit: the quantity alone (EC-55).
      r.item({
        id: id("I1"),
        poId: id("P1"),
        poItemNo: 10,
        ordQty: 2_125,
        description: null,
        unit: null,
        balanceQty: q(2_125),
        dspQty: q(0),
      }),
      r.item({
        id: id("I2"),
        poId: id("P1"),
        poItemNo: 20,
        ordQty: 1_000,
        materialCode: null,
        description: null,
        unit: " NOS ",
        balanceQty: q(1_000),
        dspQty: q(0),
      }),
    ]);
  });
  afterAll(() => db.close());

  it("writes the material code or `No Description`, the quantity without a unit, and the exact total", async () => {
    const { rows: cells } = await exported(send, "/api/reports/pending/export", "pending.json");
    expect(cells.slice(9).map(values)).toEqual([
      [1, "M-10", "2.125", 0, "4600001", null, null, null, 0],
      [2, "No Description", "1  NOS", 0, "4600001", null, null, null, 0],
      ["TOTAL", null, "3.125 NOS", 0, null, null, null, null, null],
    ]);
  });
});

// C4: D1 binds at most 100 parameters to a statement, however many POs are selected or pending.
describe("150 POs", () => {
  let db: NodeDb;
  let send: Send;
  const poIds = Array.from({ length: 150 }, (_, i) => `01J9Z8Q4S5T6V7W8X9Y0P0${String(i).padStart(4, "0")}`);
  beforeAll(async () => {
    db = await supplierDb();
    send = routesOver(db);
    const r = rows(db);
    await db.batch(
      poIds.flatMap((poId, i) => [
        r.po({ id: poId, poNumber: String(4600000 + i), poDate: "2025-04-01" }),
        r.item({
          id: `01J9Z8Q4S5T6V7W8X9Y0I0${String(i).padStart(4, "0")}`,
          poId,
          poItemNo: 10,
          ordQty: 1_000,
          balanceQty: q(1_000),
        }),
      ]),
    );
  });
  afterAll(() => db.close());

  it.each([
    ["/api/reports/pending/export", undefined, "pending.json", 9 + 150 + 1],
    ["/api/reports/reconciliation/export?from=2025-04-01&to=2025-04-01", undefined, "reconciliation.json", 1 + 150],
    ["/api/reports/export-selected", selected(...poIds.toReversed()), "export-selected.json", 1 + 150],
  ])("%s binds at most 100 parameters per statement and writes every item", async (path, init, golden, count) => {
    let cells: GoldenCell[][] = [];
    const most = await mostBoundParams(db, async () => {
      cells = (await exported(send, path, golden, init)).rows;
    });
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(100);
    expect(cells.length).toBe(count);
  });

  it("orders the selected POs by number", async () => {
    const { rows: cells } = await exported(
      send,
      "/api/reports/export-selected",
      "export-selected.json",
      selected(...poIds.toReversed()),
    );
    expect(cells.slice(1).map((row) => row[0])).toEqual(poIds.map((_, i) => String(4600000 + i)));
  });
});
