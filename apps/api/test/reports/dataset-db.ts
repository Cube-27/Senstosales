// The SPEC-13 report dataset (`@senstosales/documents/test/reports/dataset`) in a test DB, so every export test
// seeds the same synthetic rows its golden was worked from (C1). The derived columns are written by `recompute`, as a
// write batch would; `dataset-db.test.ts` checks they come out as the dataset works them by hand.
import type { Instant } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem, poLot, srv, srvItem, supplier } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import {
  DCS,
  INVOICES,
  ITEMS,
  LOTS,
  POS,
  SRVS,
  SUPPLIER as DATASET_SUPPLIER,
} from "@senstosales/documents/test/reports/dataset";
import type { Fy, GstPct, Money, Qty } from "@senstosales/domain";
import { invoiceLineTax } from "@senstosales/domain";
import { eq } from "drizzle-orm";

import { d, id as ulid, m, q, recompute } from "../seed-rows.ts";
import { supplierDb, SUPPLIER } from "../service-deps.ts";

const FY = "2025-26" as Fy;
const S = { supplierId: SUPPLIER };
const zeros = { dspQty: q(0), rcdQty: q(0), rejQty: q(0), balanceQty: q(0) };
const PCT_9 = 9_00000 as GstPct;

/** The fixed id of every dataset row, by its dataset key (PO key, item key, DC or invoice number, SRV number). */
export const reportIds = {
  po: { A: ulid("PA"), B: ulid("PB"), C: ulid("PC") },
  item: { A10: ulid("QA"), A20: ulid("QB"), B10: ulid("QC"), C10: ulid("QD") },
  dc: { "101": ulid("D1"), "102": ulid("D2"), "103": ulid("D3") },
  invoice: { "201": ulid("F1"), "202": ulid("F2") },
  srv: { "301": ulid("H1") },
} as const;

const created = (i: number) => `2025-06-01T0${i}:00:00.000Z` as Instant;

function supplierRows(db: NodeDb) {
  const { address, contact } = DATASET_SUPPLIER;
  return [db.build.update(supplier).set({ address, contact }).where(eq(supplier.id, SUPPLIER))];
}

function poRows(db: NodeDb) {
  const b = db.build;
  return [
    ...POS.map((row) =>
      b.insert(po).values({
        ...S,
        ...zeros,
        id: reportIds.po[row.key],
        poNumber: row.poNumber,
        poDate: d(row.poDate),
        poValue: m(row.poValue),
        amendNo: 0,
        isGemc: row.gemcNumber !== null,
        gemcNumber: row.gemcNumber,
        rawHeader: {},
        status: "Pending",
        ordQty: q(0),
      }),
    ),
    ...ITEMS.map((row) =>
      b.insert(poItem).values({
        ...S,
        ...zeros,
        id: reportIds.item[row.key],
        poId: reportIds.po[row.po],
        poItemNo: row.poItemNo,
        materialCode: row.materialCode,
        description: row.description,
        unit: row.unit,
        ordQty: q(row.ordQty),
        rateSource: m("rateSource" in row ? row.rateSource : row.rate),
        rate: m(row.rate),
        poRcdQty: q(row.poRcdQty),
        poRejQty: null,
        uninvoicedQty: q(0),
        status: "Pending",
      }),
    ),
    ...LOTS.map((row, i) =>
      b.insert(poLot).values({
        ...S,
        id: ulid(`R${i + 1}`),
        poItemId: reportIds.item[row.item],
        lotNo: row.lotNo,
        delyQty: q(row.delyQty),
        delyDate: d(row.delyDate),
        entryAllowDate: row.entryAllowDate === null ? null : d(row.entryAllowDate),
      }),
    ),
  ];
}

/** DC lines get ids `E1`, `E2`, … in dataset order; invoice 201's lines repeat DC 101's. */
const dcItemId = (dcIndex: number, lineIndex: number) => ulid(`E${dcIndex * 2 + lineIndex + 1}`);

function dcRows(db: NodeDb) {
  const b = db.build;
  return DCS.flatMap((row, i) => [
    b.insert(dc).values({
      ...S,
      id: reportIds.dc[row.number],
      poId: reportIds.po[row.po],
      number: row.number,
      dcDate: d(row.dcDate),
      financialYear: FY,
      gcNumber: row.number,
      gcDate: d(row.dcDate),
      consigneeName: row.consigneeName,
      createdAt: created(i + 1),
    }),
    ...row.lines.map((line, j) =>
      b.insert(dcItem).values({
        ...S,
        id: dcItemId(i, j),
        dcId: reportIds.dc[row.number],
        poItemId: reportIds.item[line.item],
        dspQty: q(line.dspQty),
        createdAt: created(i + 1),
      }),
    ),
  ]);
}

/** A line's taxes at 9% + 9%; an IGST invoice (202) carries the same 18% as IGST, as the dataset's totals do. */
function lineTax(qty: Qty, rate: Money, igst: boolean) {
  const tax = invoiceLineTax({ qty, rate, cgstPct: PCT_9, sgstPct: PCT_9, gemc: false });
  return igst ? { ...tax, cgst: m(0), sgst: m(0), igst: m(tax.cgst + tax.sgst) } : tax;
}

function invoiceRows(db: NodeDb) {
  const b = db.build;
  return INVOICES.flatMap((row, i) => [
    b.insert(invoice).values({
      ...S,
      id: reportIds.invoice[row.number],
      poId: reportIds.po[row.po],
      dcId: row.dc === null ? null : reportIds.dc[row.dc],
      kind: row.dc === null ? "direct" : "dc",
      number: row.number,
      invoiceDate: d(row.invoiceDate),
      financialYear: FY,
      cgstPct: PCT_9,
      sgstPct: PCT_9,
      taxable: m(row.taxable),
      cgst: m(row.cgst),
      sgst: m(row.sgst),
      igst: m(row.igst),
      total: m(row.total),
      createdAt: created(i + 4),
    }),
    ...row.lines.map((line, j) =>
      b.insert(invoiceItem).values({
        ...S,
        id: ulid(`G${i * 2 + j + 1}`),
        invoiceId: reportIds.invoice[row.number],
        poItemId: reportIds.item[line.item],
        dcItemId:
          row.dc === null
            ? null
            : dcItemId(
                DCS.findIndex((x) => x.number === row.dc),
                j,
              ),
        qty: q(line.qty),
        rate: m(line.rate),
        ...lineTax(q(line.qty), m(line.rate), row.igst > 0),
      }),
    ),
  ]);
}

function srvRows(db: NodeDb) {
  const b = db.build;
  return SRVS.flatMap((row) => [
    b.insert(srv).values({
      ...S,
      id: reportIds.srv[row.srvNumber],
      poId: reportIds.po[row.po],
      poNumber: POS.find((p) => p.key === row.po)!.poNumber,
      srvNumber: row.srvNumber,
      srvDate: d(row.srvDate),
      financialYear: FY,
      rawHeader: {},
    }),
    ...row.lines.map((line, j) => {
      const item = ITEMS.find((x) => x.key === line.item)!;
      return b.insert(srvItem).values({
        ...S,
        id: ulid(`J${j + 1}`),
        srvId: reportIds.srv[row.srvNumber],
        poItemId: reportIds.item[line.item],
        materialCode: item.materialCode,
        poItemNo: item.poItemNo,
        lotNo: 1,
        srvItemNo: j + 1,
        ordQty: q(item.ordQty),
        rcdQty: q(line.rcdQty),
        acceptedQty: q(line.rcdQty),
        rejQty: q(line.rejQty),
        challanNo: row.challanNo,
        invoiceNo: row.invoiceNo,
        // Challan 101 and invoice 201 resolve to DC 101 and invoice 201 (INV-37).
        resolvedDcId: reportIds.dc[row.challanNo],
        resolvedInvoiceId: reportIds.invoice[row.invoiceNo],
      });
    }),
  ]);
}

/** A fresh test DB holding the report dataset with its derived columns recomputed. The caller closes it. */
export async function reportDb(): Promise<NodeDb> {
  const db = await supplierDb();
  await db.batch([...supplierRows(db), ...poRows(db), ...dcRows(db), ...invoiceRows(db), ...srvRows(db)]);
  await recompute(db, ...Object.values(reportIds.po));
  return db;
}
