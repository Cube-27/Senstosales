// SPEC-13 PR 3: the PO, DC and invoice registers and the DC and invoice list CSVs over the report dataset match their
// legacy-derived goldens (INV-68) byte for byte (CSV) or cell for cell (xlsx), with the catalog's file names.
import type { NodeDb } from "@senstosales/db/node";
import { downloadFileName } from "@senstosales/schemas";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { routesOver, rows } from "../seed-rows.ts";
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
