// SPEC-13 PR 3: the PO, DC and invoice registers and the DC and invoice list CSVs over the report dataset match their
// legacy-derived goldens (INV-68) byte for byte (CSV) or cell for cell (xlsx), with the catalog's file names.
import type { NodeDb } from "@senstosales/db/node";
import { downloadFileName } from "@senstosales/schemas";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { mostBoundParams } from "../helpers.ts";
import { id, m, routesOver, rows } from "../seed-rows.ts";
import { supplierDb } from "../service-deps.ts";
import { reportDb } from "./dataset-db.ts";
import { goldenText, workbookGolden, workbookGoldenFile } from "./golden.ts";

async function download(send: ReturnType<typeof routesOver>, path: string) {
  const res = await send(path);
  expect(res.status).toBe(200);
  return { fileName: downloadFileName(res), bytes: new Uint8Array(await res.arrayBuffer()) };
}

/** CSV bytes as text, the BOM kept. */
const csvText = (bytes: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

describe("over the report dataset", () => {
  let db: NodeDb;
  let send: ReturnType<typeof routesOver>;
  beforeAll(async () => {
    db = await reportDb();
    send = routesOver(db);
  });
  afterAll(() => db.close());

  const csvLines = async (path: string) => csvText((await download(send, path)).bytes).split("\r\n");
  /** The first column of each data row of a CSV export. */
  const firstColumn = async (path: string) => (await csvLines(path)).slice(1, -1).map((line) => line.split(",")[0]);

  describe("register goldens", () => {
    it.each([
      ["/api/reports/po-register/export", "po-register.json"],
      ["/api/reports/po-register/export?from=2025-03-01&to=2025-05-31", "po-register.json"],
      ["/api/reports/po-register/export?from=2026-01-01", "po-register-empty.json"],
      ["/api/reports/dc-register/export", "dc-register.json"],
      ["/api/reports/invoice-register/export", "invoice-register.json"],
    ])("%s matches %s", async (path, file) => {
      const golden = workbookGoldenFile(file);
      const { fileName, bytes } = await download(send, path);
      expect(await workbookGolden(bytes, fileName, golden.styles)).toEqual(golden);
    });

    it("keeps only documents dated in the range", async () => {
      const golden = workbookGoldenFile("dc-register.json");
      const { fileName, bytes } = await download(send, "/api/reports/dc-register/export?from=2025-05-01&to=2025-05-27");
      expect((await workbookGolden(bytes, fileName, golden.styles)).rows.slice(1)).toEqual([golden.rows[2]]);
    });

    it("answers 400 for a malformed range", async () => {
      expect((await send("/api/reports/invoice-register/export?from=2025-13-01")).status).toBe(400);
    });
  });

  describe("list CSV goldens", () => {
    it.each([
      ["/api/dc/export", "dc-list.csv", "DC_List_Export_All.csv"],
      ["/api/invoice/export", "invoice-list.csv", "Invoice_List_Export.csv"],
    ])("%s matches %s byte for byte", async (path, file, name) => {
      const { fileName, bytes } = await download(send, path);
      expect(fileName).toBe(name);
      expect(csvText(bytes)).toBe(goldenText(file));
    });

    it("keeps the DC list's filters: text, date range and value range", async () => {
      const [header, ...lines] = (await csvLines("/api/dc/export?q=Works&valueMin=600")).filter(Boolean);
      expect(header).toBe("﻿Record,Date,Contract,Consignee,Status,Value,Ord Qty,Delivered Qty,Pending Qty,Received Qty");
      expect(lines).toEqual(["101,2025-04-25,4500101,Example Works Unit,Pending,700,15,11,1,10"]);
      expect(await firstColumn("/api/dc/export?from=2025-05-01&to=2025-05-27")).toEqual(["102"]);
    });

    it("keeps the DC list's chosen sort, ties in the default order", async () => {
      expect(await firstColumn("/api/dc/export?sort=value&dir=asc")).toEqual(["102", "103", "101"]);
      expect(await firstColumn("/api/dc/export?sort=poNumber&dir=desc")).toEqual(["103", "102", "101"]);
      expect(await firstColumn("/api/dc/export?sort=poNumber&dir=asc")).toEqual(["102", "101", "103"]);
    });

    it("keeps the invoice list's filters and sort", async () => {
      expect(await firstColumn("/api/invoice/export?q=101")).toEqual(["201"]);
      expect(await firstColumn("/api/invoice/export?valueMax=100")).toEqual(["202"]);
      expect(await firstColumn("/api/invoice/export?sort=itemCount&dir=desc")).toEqual(["201", "202"]);
      expect(await firstColumn("/api/invoice/export?sort=total&dir=asc")).toEqual(["202", "201"]);
    });
  });
});

// DOC-FRAC and the GEMC registers: quantities go out exact to 3 dp, a GEMC PO's amounts to 5 dp (A-12).
describe("a GEMC PO with fractional quantities", () => {
  let db: NodeDb;
  let send: ReturnType<typeof routesOver>;
  beforeAll(async () => {
    db = await supplierDb();
    send = routesOver(db);
    const r = rows(db);
    await db.batch([
      r.po({ id: id("P1"), poNumber: "4500900", poDate: "2025-05-01", poValue: 123_45678, gemcNumber: "GEMC-1" }),
      r.item({ id: id("I1"), poId: id("P1"), poItemNo: 10, ordQty: 12_345, rate: m(10_00001) }),
      r.dc({ id: id("D1"), poId: id("P1"), number: "301", dcDate: "2025-05-10", createdAt: "2025-05-10T00:00:00.000Z" }),
      r.dcItem({ id: id("L1"), dcId: id("D1"), poItemId: id("I1"), dspQty: 1 }),
      r.invoice({
        id: id("V1"),
        poId: id("P1"),
        number: "401",
        invoiceDate: "2025-05-11",
        total: 12_34567,
        createdAt: "2025-05-11T00:00:00.000Z",
      }),
      r.invoiceItem({ id: id("J1"), invoiceId: id("V1"), poItemId: id("I1"), qty: 12_345 }),
    ]);
  });
  afterAll(() => db.close());

  /** The first data row of an export's only sheet, as cell values. */
  async function firstRow(path: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await download(send, path)).bytes.slice().buffer);
    return (workbook.worksheets[0]!.getRow(2).values as unknown[]).slice(1);
  }

  it("writes the PO register's value at 5 dp and its quantity at 3", async () => {
    expect(await firstRow("/api/reports/po-register/export")).toEqual([
      "4500900",
      "2025-05-01",
      "Example Supplier",
      123.45678,
      "Pending",
      1,
      0,
    ]);
  });

  it("writes the DC register's 0.001 dispatched, not 0", async () => {
    expect((await firstRow("/api/reports/dc-register/export"))[5]).toBe(0.001);
  });

  it("writes the invoice register's amounts at 5 dp", async () => {
    expect((await firstRow("/api/reports/invoice-register/export")).slice(4)).toEqual([12.34567, 12.34567, 0]);
  });

  it("writes the CSVs' quantities exact and the GEMC value at 5 dp", async () => {
    const dcCsv = csvText((await download(send, "/api/dc/export")).bytes).split("\r\n");
    expect(dcCsv[1]).toBe("301,2025-05-10,4500900,,Pending,0.01,12.345,0.001,12.344,0");
    const invoiceCsv = csvText((await download(send, "/api/invoice/export")).bytes).split("\r\n");
    expect(invoiceCsv[1]).toBe("401,2025-05-11,,4500900,1,12.345,12.34567,Delivered,12.345");
  });
});

// INV-99: no row cap, and pages are read only as the download is.
describe("streaming 10,000 POs", () => {
  let db: NodeDb;
  let send: ReturnType<typeof routesOver>;
  beforeAll(async () => {
    db = await supplierDb();
    send = routesOver(db);
    const r = rows(db);
    const pos = Array.from({ length: 10_000 }, (_, i) =>
      r.po({
        id: `01J9Z8Q4S5T6V7W8X9${String(i).padStart(8, "0")}`,
        poNumber: String(5_000_000 + i),
        poDate: "2024-01-01",
      }),
    );
    for (let i = 0; i < pos.length; i += 1_000) await db.batch(pos.slice(i, i + 1_000));
  });
  afterAll(() => db.close());

  it("exports every PO with no row cap", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await download(send, "/api/reports/po-register/export")).bytes.slice().buffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.rowCount).toBe(10_001);
    expect(sheet.getRow(10_001).getCell(1).value).toBe("5000000");
  });

  it("reads pages only as the body is read, and stops when the client does", async () => {
    let queries = 0;
    const query = db.query.bind(db);
    db.query = ((...args: Parameters<typeof query>) => {
      queries += 1;
      return query(...args);
    }) as typeof db.query;
    try {
      const reader = (await send("/api/reports/po-register/export")).body!.getReader();
      await reader.read();
      await reader.cancel();
      const atCancel = queries;
      // The supplier, then a page of 500 and its item counts per read-ahead; all 20 pages would be 41 reads.
      expect(atCancel).toBeLessThan(10);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(queries).toBe(atCancel);
    } finally {
      db.query = query;
    }
  });
});

// C4: D1 binds at most 100 parameters to a statement, so no export statement may bind more, however many documents
// a page holds (#69 review).
describe("150 DCs and invoices", () => {
  let db: NodeDb;
  let send: ReturnType<typeof routesOver>;
  beforeAll(async () => {
    db = await supplierDb();
    send = routesOver(db);
    const r = rows(db);
    const tag = (n: number) => String(n).padStart(4, "0");
    await db.batch([
      r.po({ id: id("P1"), poNumber: "4600001", poDate: "2025-04-01" }),
      r.item({ id: id("I1"), poId: id("P1"), poItemNo: 10, ordQty: 1_000_000 }),
    ]);
    const docs = Array.from({ length: 150 }, (_, i) => {
      const dcId = `01J9Z8Q4S5T6V7W8X9Y0D0${tag(i)}`;
      const invoiceId = `01J9Z8Q4S5T6V7W8X9Y0F0${tag(i)}`;
      const dcItemId = `01J9Z8Q4S5T6V7W8X9Y0E0${tag(i)}`;
      return [
        r.dc({
          id: dcId,
          poId: id("P1"),
          number: String(1000 + i),
          dcDate: "2025-05-01",
          createdAt: "2025-05-01T00:00:00.000Z",
        }),
        r.dcItem({ id: dcItemId, dcId, poItemId: id("I1"), dspQty: 1_000 }),
        r.invoice({
          id: invoiceId,
          poId: id("P1"),
          dcId,
          number: String(2000 + i),
          invoiceDate: "2025-05-02",
          total: 100_00000,
          createdAt: "2025-05-02T00:00:00.000Z",
        }),
        r.invoiceItem({ id: `01J9Z8Q4S5T6V7W8X9Y0G0${tag(i)}`, invoiceId, poItemId: id("I1"), dcItemId, qty: 1_000 }),
      ];
    });
    await db.batch(docs.flat());
  });
  afterAll(() => db.close());

  it.each([
    "/api/reports/po-register/export",
    "/api/reports/dc-register/export",
    "/api/reports/invoice-register/export",
    "/api/dc/export",
    "/api/invoice/export",
  ])("%s binds at most 100 parameters per statement and exports every document", async (path) => {
    const most = await mostBoundParams(db, async () => {
      const { bytes } = await download(send, path);
      expect(bytes.length).toBeGreaterThan(0);
    });
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(100);
  });

  it("lists all 150 DCs in the CSV", async () => {
    const text = csvText((await download(send, "/api/dc/export")).bytes);
    expect(text.split("\r\n").length).toBe(152);
  });
});
