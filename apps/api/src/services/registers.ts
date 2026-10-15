// The PO, DC and invoice registers and the DC and invoice list CSVs (SPEC-13 §2), each with its catalog layout and
// file name. Documents come a keyset page at a time with their lines (INV-99), are totalled with the domain (C2) and
// written as they stand: no flag column, nothing clamped (INV-60, INV-61). Numbers go out to 2 dp (D-0260).
import type { ListProgress, Money, Qty, SrvLineQty } from "@senstosales/domain";
import { dcListProgress, dcListTotals, invoiceListProgress, srvLineShown, sumMoney, sumQty } from "@senstosales/domain";
import type { Row } from "@senstosales/documents";
import { EXPORTS } from "@senstosales/documents/catalog";
import type { routes } from "@senstosales/schemas";
import { moneyNumber, qtyNumber } from "@senstosales/schemas";
import type { z } from "zod";

import { keysetRows } from "../repositories/keyset.ts";
import type { Range } from "../repositories/registers.ts";
import {
  DC_KEY,
  dcLinesOfItems,
  dcListPage,
  dcRegisterPage,
  dspOfDcs,
  INVOICE_KEY,
  invoiceListPage,
  invoiceRegisterPage,
  itemCountsOfPos,
  linesOfDcs,
  linesOfInvoices,
  PO_REGISTER_KEY,
  poRegisterPage,
  srvLinesOfDcs,
  srvLinesOfInvoices,
} from "../repositories/registers.ts";
import { findSupplier } from "../repositories/supplier.ts";
import { DC_LIST_SORTS } from "./dc.ts";
import { INVOICE_LIST_SORTS } from "./invoice.ts";
import type { ServiceDeps } from "./index.ts";
import { csvFile, mapped, xlsxFile } from "./exports.ts";
import { inValueRange, sortedBy } from "./paging.ts";

type DcListQuery = z.output<(typeof routes)["dc.export"]["query"]>;
type InvoiceListQuery = z.output<(typeof routes)["invoice.export"]["query"]>;
type DcPageRow = Awaited<ReturnType<typeof dcListPage>>[number];
type InvoicePageRow = Awaited<ReturnType<typeof invoiceListPage>>[number];
type InvoiceListRow = InvoicePageRow & { itemCount: number; qty: Qty } & ListProgress & { deliveredQty: Qty };

const money = (m: Money | null) => (m === null ? null : moneyNumber(m));
const NONE = 0 as Qty;

/** Quantities added by key with the domain; rows without a key are left out. */
function sumsBy<T>(rows: readonly T[], key: (row: T) => string | null, value: (row: T) => Qty) {
  const groups = Map.groupBy(
    rows.filter((row) => key(row) !== null),
    (row) => key(row)!,
  );
  return new Map([...groups].map(([k, group]) => [k, sumQty(group.map(value))]));
}

export function registersService({ db }: Pick<ServiceDeps, "db">) {
  /** Each DC with its line count and dispatched total. */
  async function withDspTotals(rows: readonly DcPageRow[]) {
    const lines = Map.groupBy(
      await dspOfDcs(
        db,
        rows.map((row) => row.id),
      ),
      (line) => line.dcId,
    );
    return rows.map((row) => {
      const group = lines.get(row.id) ?? [];
      return { ...row, lineCount: group.length, dspQty: sumQty(group.map((line) => line.dspQty)) };
    });
  }

  /** Each DC with its list totals (EC-38) and its EC-39 Status and Pending Qty. */
  async function withListTotals(rows: readonly DcPageRow[]) {
    const lines = await linesOfDcs(
      db,
      rows.map((row) => row.id),
    );
    const onAllDcs = sumsBy(
      await dcLinesOfItems(db, [...new Set(lines.map((line) => line.poItemId))]),
      (line) => line.poItemId,
      (line) => line.dspQty,
    );
    const byDc = Map.groupBy(lines, (line) => line.dcId);
    return rows.map((row) => {
      const group = byDc.get(row.id) ?? [];
      const progress = dcListProgress(
        group.map((line) => ({ ...line, itemDspOnAllDcs: onAllDcs.get(line.poItemId) ?? NONE })),
      );
      return { ...row, lineCount: group.length, ...dcListTotals(group), ...progress };
    });
  }

  /** Each invoice with its line count and quantity and its EC-40 columns. */
  async function withInvoiceTotals(rows: readonly InvoicePageRow[]): Promise<InvoiceListRow[]> {
    const dcIds = rows.flatMap((row) => (row.dcId === null ? [] : [row.dcId]));
    const directIds = rows.flatMap((row) => (row.dcId === null ? [row.id] : []));
    const [invoiceLines, dcLines, srvOfDcs, srvOfInvoices] = await Promise.all([
      linesOfInvoices(
        db,
        rows.map((row) => row.id),
      ),
      dspOfDcs(db, dcIds),
      srvLinesOfDcs(db, dcIds),
      srvLinesOfInvoices(db, directIds),
    ]);
    const lines = Map.groupBy(invoiceLines, (line) => line.invoiceId);
    const dcDsp = sumsBy(
      dcLines,
      (line) => line.dcId,
      (line) => line.dspQty,
    );
    const received = (line: SrvLineQty) => srvLineShown(line).rcdQty;
    const rcdByDc = sumsBy(srvOfDcs, (line) => line.resolvedDcId, received);
    const rcdByInvoice = sumsBy(srvOfInvoices, (line) => line.resolvedInvoiceId, received);
    return rows.map((row) => {
      const qtys = (lines.get(row.id) ?? []).map((line) => line.qty);
      const invoiceQty = sumQty(qtys);
      const progress = invoiceListProgress({
        invoiceQty,
        sourceDcDspQty: row.dcId === null ? null : (dcDsp.get(row.dcId) ?? NONE),
        receivedQty: (row.dcId === null ? rcdByInvoice.get(row.id) : rcdByDc.get(row.dcId)) ?? NONE,
      });
      return { ...row, itemCount: qtys.length, qty: invoiceQty, ...progress };
    });
  }

  return {
    /** POs dated in the range, newest first; the install's supplier on every row (EC-44). */
    poRegister(range: Range) {
      async function* rows(): AsyncGenerator<Row<string>> {
        const supplierName = (await findSupplier(db))?.name ?? null;
        const pos = keysetRows(PO_REGISTER_KEY, async (page) => {
          const found = await poRegisterPage(db, range, page);
          const counts = await itemCountsOfPos(
            db,
            found.map((row) => row.id),
          );
          return found.map((row) => ({ ...row, itemCount: counts.get(row.id) ?? 0 }));
        });
        for await (const row of pos) {
          yield {
            poNumber: row.number,
            poDate: row.poDate,
            supplierName,
            poValue: money(row.poValue),
            status: row.status,
            itemCount: row.itemCount,
            ordQty: qtyNumber(row.ordQty),
          };
        }
      }
      return xlsxFile(EXPORTS.poRegister.fileName(), EXPORTS.poRegister.sheet, rows());
    },

    /** DCs dated in the range, newest first. */
    dcRegister(range: Range) {
      const dcs = keysetRows(DC_KEY, async (page) => withDspTotals(await dcRegisterPage(db, range, page)));
      const rows = mapped(dcs, (row) => ({
        number: row.number,
        dcDate: row.dcDate,
        poNumber: row.poNumber,
        consigneeName: row.consigneeName,
        itemCount: row.lineCount,
        dspQty: qtyNumber(row.dspQty),
      }));
      return xlsxFile(EXPORTS.dcRegister.fileName(), EXPORTS.dcRegister.sheet, rows);
    },

    /** Invoices dated in the range, newest first; a PO-direct invoice has no DC number. */
    invoiceRegister(range: Range) {
      const invoices = keysetRows(INVOICE_KEY, (page) => invoiceRegisterPage(db, range, page));
      const rows = mapped(invoices, (row) => ({
        number: row.number,
        invoiceDate: row.invoiceDate,
        poNumber: row.poNumber,
        dcNumber: row.dcNumber,
        total: money(row.total),
        taxable: money(row.taxable),
        tax: money(sumMoney([row.cgst, row.sgst, row.igst])),
      }));
      return xlsxFile(EXPORTS.invoiceRegister.fileName(), EXPORTS.invoiceRegister.sheet, rows);
    },

    /**
     * The DC list's rows for its filters and sort, as CSV. As on the list, a DC without lines is not listed. The list
     * has no PO filter, so the file is always `_All` (EC-48).
     */
    dcList(query: DcListQuery) {
      const dcs = keysetRows(DC_KEY, async (page) => withListTotals(await dcListPage(db, query, page)));
      const listed = mapped(dcs, (row) => (row.lineCount > 0 && inValueRange(row.value, query) ? row : undefined));
      const rows = mapped(sortedBy(listed, query, DC_LIST_SORTS), (row) => ({
        number: row.number,
        dcDate: row.dcDate,
        poNumber: row.poNumber,
        consigneeName: row.consigneeName,
        status: row.status,
        value: money(row.value),
        ordQty: qtyNumber(row.ordQty),
        dspQty: qtyNumber(row.dspQty),
        pendingQty: qtyNumber(row.pendingQty),
        rcdQty: qtyNumber(row.rcdQty),
      }));
      return csvFile(EXPORTS.dcList, rows);
    },

    /** The invoice list's rows for its filters and sort (SPEC-11's list), as CSV. */
    invoiceList(query: InvoiceListQuery) {
      const invoices = keysetRows(INVOICE_KEY, async (page) =>
        withInvoiceTotals(await invoiceListPage(db, query, page)),
      );
      // As on the list, an invoice without lines is not listed.
      const listed = mapped(invoices, (row) => (row.itemCount > 0 ? row : undefined));
      const rows = mapped(sortedBy(listed, query, INVOICE_LIST_SORTS), (row) => ({
        number: row.number,
        invoiceDate: row.invoiceDate,
        dcNumber: row.dcNumber,
        poNumber: row.poNumber,
        itemCount: row.itemCount,
        dspQty: qtyNumber(row.deliveredQty),
        total: money(row.total),
        status: row.status,
        pendingQty: qtyNumber(row.pendingQty),
      }));
      return csvFile(EXPORTS.invoiceList, rows);
    },
  };
}

export type RegistersService = ReturnType<typeof registersService>;
