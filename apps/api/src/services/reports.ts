// The /reports tabs (SPEC-13 §2): pending items, reconciliation and the daily dispatch summary (A-16 reversed), as
// paged lists and as the workbooks their exports write, plus export-selected. A list and its export read the same keyset order, so a list's rows are its export's
// rows (SPEC-13 PR 5). Values are the stored ones as they stand (INV-61); Accepted is the item's received quantity
// (A2-8, INV-09). No export has a flag column (INV-60).
import type { Db } from "@senstosales/db";
import { dc, po, poItem } from "@senstosales/db";
import { EXPORTS } from "@senstosales/documents/catalog";
import type { IsoDate, Qty } from "@senstosales/domain";
import { defaultReportRange, qtyToString, sumQty, TOL } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { fmtDateDashed, foldRepeatedLines, qtyNumber } from "@senstosales/schemas";
import type { SQL } from "drizzle-orm";
import { and, eq, gt, gte, lte, or } from "drizzle-orm";
import type { z } from "zod";

import { dcNotFound, onboardingRequired, poNotFound } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import { findDcWithPo, itemsOfDc } from "../repositories/dc.ts";
import type { Keyset } from "../repositories/keyset.ts";
import { keysetRows, listKey } from "../repositories/keyset.ts";
import type { DispatchLine, ReportItem } from "../repositories/reports.ts";
import {
  BY_DISPATCH,
  BY_NEWEST_PO,
  BY_PO_NUMBER,
  DISPATCH_SORTS,
  dispatchLines,
  DOCUMENTS_BATCH,
  itemDocuments,
  poNumbersOf,
  REPORT_SORTS,
  reportColumns,
  reportItems,
} from "../repositories/reports.ts";
import { contains, inBatches, inRange } from "../repositories/sql.ts";
import { findSupplier } from "../repositories/supplier.ts";
import { gcFile, mapped, summaryFile, xlsxFile } from "./exports.ts";
import { byNumber, LIST_READ_PAGE, pageOfRows } from "./paging.ts";

type PendingQuery = z.output<(typeof routes)["reports.pendingExport"]["query"]>;
type DispatchQuery = z.output<(typeof routes)["reports.dispatchExport"]["query"]>;
type ReconciliationQuery = z.output<(typeof routes)["reports.reconciliationExport"]["query"]>;
type ExportSelectedBody = z.output<(typeof routes)["reports.exportSelected"]["body"]>;
type DcIdQuery = z.output<(typeof routes)["reports.guaranteeCertificateExport"]["query"]>;
type Paged = { page: number; pageSize: number };

const dated = (from: IsoDate | undefined, to: IsoDate | undefined): SQL | undefined =>
  and(from === undefined ? undefined : gte(po.poDate, from), to === undefined ? undefined : lte(po.poDate, to));

/** The tab's search box: text in the PO number or the item description. */
const searched = (text: string | undefined): SQL | undefined =>
  text ? or(contains(po.poNumber, text), contains(poItem.description, text)) : undefined;

/**
 * Pending: dated in the range with quantity still to supply, `gtTol(balance, 0)` (INV-02) as legacy's
 * `balance > 0.001`, read in SQL so items with nothing to supply are never fetched.
 */
const pendingWhere = (q: PendingQuery) => and(dated(q.from, q.to), gt(poItem.balanceQty, TOL), searched(q.q));

/** The tab's rows, narrowed by its search box. */
function reconciliationWhere(q: ReconciliationQuery, today: IsoDate) {
  return and(reconciliationScope(q, today), searched(q.q));
}

/** One PO (EC-42), the range, or without both range ends the default report range (INV-113). */
function reconciliationScope(q: ReconciliationQuery, today: IsoDate) {
  if (q.poId !== undefined) return eq(po.id, q.poId);
  if (q.from === undefined || q.to === undefined) {
    const { from, to } = defaultReportRange(today);
    return dated(from, to);
  }
  return dated(q.from, q.to);
}

/** A reconciliation workbook row (catalog `RECONCILIATION_COLUMNS`): quantities at 2 dp. */
const reconciliationCells = (r: ReturnType<typeof reportColumns>) => ({
  poNumber: r.poNumber,
  poItemNo: r.poItemNo,
  poDate: r.poDate,
  description: r.description,
  ordQty: qtyNumber(r.ordQty),
  dspQty: qtyNumber(r.dspQty),
  rcdQty: qtyNumber(r.rcdQty),
  rejQty: qtyNumber(r.rejQty),
  balanceQty: qtyNumber(r.balanceQty),
});

/** The TOTAL quantity: followed by the unit when every row has the same one (blank units ignored), as legacy. */
const summaryTotal = (total: Qty, units: ReadonlySet<string>) =>
  units.size === 1 ? `${qtyToString(total)} ${[...units][0]}` : qtyNumber(total);

/** A summary's quantity cell: the quantity and its unit, `10 NOS`; the quantity alone without a unit (EC-54). */
const qtyWithUnit = (q: Qty, unit: string | null) => `${qtyToString(q)} ${unit ?? ""}`.trim();

/** The daily dispatch TOTAL as the owner's summaries print it: each unit's sum, `42.5 Nos + 1 Set`; none gives 0. */
function dispatchTotal(byUnit: ReadonlyMap<string, Qty>) {
  const parts = [...byUnit].map(([unit, qty]) => qtyWithUnit(qty, unit));
  return parts.length === 0 ? 0 : parts.join(" + ");
}

/** A GEMC number that is not blank. */
const hasText = (n: string | null): n is string => Boolean(n?.trim());

/** A summary's description: repeated lines once; without one the material code, else `No Description` (legacy). */
const summaryDescription = (r: { description: string | null; materialCode: string | null }) =>
  foldRepeatedLines(r.description ?? r.materialCode ?? "No Description");

/** The daily dispatch tab's range: today without one. */
const dispatchRange = (q: DispatchQuery, today: IsoDate) => ({ from: q.from ?? today, to: q.to ?? today });

/** A DC line's GEMC number: its DC's invoice's, else its PO's, as the pending summary takes it. */
const dispatchGemc = (r: DispatchLine) => [r.invoiceGemcNumber, r.poGemcNumber].find(hasText) ?? null;

/** The invoice a DC line cites, as the DC sheet does: the one filled in on the DC (EC-47), else the one made from it. */
const dispatchInvoice = (r: DispatchLine) => r.dcInvoiceNumber ?? r.invoiceNumber;

/** A DC line as the tab lists it. */
const dispatchColumns = (r: DispatchLine) => ({
  dcItemId: r.dcItemId,
  dcId: r.dcId,
  dcNumber: r.dcNumber,
  dcDate: r.dcDate,
  poId: r.poId,
  poNumber: r.poNumber,
  poItemNo: r.poItemNo,
  description: r.description,
  unit: r.unit,
  dspQty: r.dspQty,
  packets: r.packets,
  gemcNumber: dispatchGemc(r),
  invoiceNumber: dispatchInvoice(r),
  departmentNo: r.departmentNo,
});

/** The DC lines as summary cells, adding up each unit's quantity and the packets for the TOTAL row as they pass. */
function dispatchSummaryRows(lines: AsyncIterable<DispatchLine>) {
  const byUnit = new Map<string, Qty>();
  let packets = 0;
  let serial = 0;
  const rows = mapped(lines, (r) => {
    const unit = r.unit?.trim() ?? "";
    byUnit.set(unit, sumQty([byUnit.get(unit) ?? (0 as Qty), r.dspQty]));
    packets += r.packets ?? 0;
    serial += 1;
    return {
      serial,
      description: summaryDescription(r),
      qty: qtyWithUnit(r.dspQty, unit),
      packets: r.packets ?? "",
      poNumber: r.poNumber,
      gemcNumber: dispatchGemc(r) ?? "",
      invoiceNumbers: dispatchInvoice(r) ?? "",
      dcNumbers: r.dcNumber,
      delivered: r.departmentNo ?? "",
    };
  });
  return { rows, total: () => ({ qty: dispatchTotal(byUnit), packets }) };
}

export function reportsService({ db, clock }: { db: Db; clock: Clock }) {
  /** Every item `where` keeps, in the query's sort, then `defaults`. */
  const items = (
    where: SQL | undefined,
    query: { sort?: keyof typeof REPORT_SORTS | undefined; dir: "asc" | "desc" },
    defaults: Keyset<ReportItem>,
    pageSize?: number,
  ) => keysetRows(listKey(REPORT_SORTS, defaults, query), (page) => reportItems(db, where, page), pageSize);

  /** Each item with the DCs and invoices raised on it; GEMC numbers are its invoices', else its PO's (legacy). */
  async function withDocuments(page: readonly ReportItem[]) {
    const docs = await itemDocuments(
      db,
      page.map((item) => item.poItemId),
    );
    const dcs = Map.groupBy(docs.dcs, (ref) => ref.poItemId);
    const invoices = Map.groupBy(docs.invoices, (ref) => ref.poItemId);
    const gemc = (n: string | null) => (hasText(n) ? [n] : []);
    return page.map((item) => {
      const own = invoices.get(item.poItemId) ?? [];
      const invoiceGemc = [...new Set(own.flatMap((i) => gemc(i.gemcNumber)))];
      return {
        ...reportColumns(item),
        gemcNumbers: invoiceGemc.length > 0 ? invoiceGemc : gemc(item.gemcNumber),
        dcs: (dcs.get(item.poItemId) ?? []).map(({ poItemId: _, ...ref }) => ref),
        invoices: own.map(({ poItemId: _, gemcNumber: __, ...ref }) => ref),
      };
    });
  }

  /** The pending rows in order (PO number, then item, by default), documents read a batch of items at a time. */
  async function* pendingRows(query: PendingQuery) {
    let batch: ReportItem[] = [];
    for await (const item of items(pendingWhere(query), query, BY_PO_NUMBER)) {
      batch.push(item);
      if (batch.length === DOCUMENTS_BATCH) {
        yield* await withDocuments(batch);
        batch = [];
      }
    }
    yield* await withDocuments(batch);
  }

  /** The reconciliation rows in order: newest PO date first by default. */
  async function* reconciliationRows(query: ReconciliationQuery, pageSize?: number) {
    const where = reconciliationWhere(query, clock.today());
    for await (const item of items(where, query, BY_NEWEST_PO, pageSize)) yield reportColumns(item);
  }

  /** A summary's heading: the install's supplier and `date`, the text after `Date:`. */
  async function summaryHeading(date: string) {
    const supplier = await findSupplier(db);
    return {
      "supplier contact": supplier?.contact ?? "",
      "supplier name": supplier?.name ?? "",
      // No v1 column (EC-41).
      "supplier description": "",
      "supplier address": supplier?.address ?? "",
      "date DD-MM-YYYY": date,
    };
  }

  /** The pending rows as summary cells, adding up the ordered quantities and units for the TOTAL row as they pass. */
  function summaryRows(query: PendingQuery) {
    let ordered = 0 as Qty;
    const units = new Set<string>();
    let serial = 0;
    const rows = mapped(pendingRows(query), (r) => {
      ordered = sumQty([ordered, r.ordQty]);
      const unit = r.unit?.trim();
      if (unit) units.add(unit);
      serial += 1;
      return {
        serial,
        description: summaryDescription(r),
        qty: qtyWithUnit(r.ordQty, r.unit),
        // No v1 column (EC-41).
        packets: 0,
        poNumber: r.poNumber,
        gemcNumber: r.gemcNumbers.join(","),
        invoiceNumbers: r.invoices.map((i) => i.number).join(","),
        dcNumbers: r.dcs.map((d) => d.number).join(","),
        delivered: qtyNumber(r.dspQty),
      };
    });
    return { rows, total: () => ({ qty: summaryTotal(ordered, units), packets: 0 }) };
  }

  /** The daily dispatch tab's DC lines dated in `range`, narrowed by its search box, in order. */
  const dispatchRows = (query: DispatchQuery, range: { from: IsoDate; to: IsoDate }, pageSize?: number) => {
    const where = and(inRange(dc.dcDate, range), searched(query.q));
    return keysetRows(listKey(DISPATCH_SORTS, BY_DISPATCH, query), (page) => dispatchLines(db, where, page), pageSize);
  };

  /** The selected POs' items, PO number then item number; an id selected twice counts once, an unknown one not at all. */
  async function* selectedRows({ poIds }: ExportSelectedBody) {
    const pos = await inBatches([...new Set(poIds)], (batch) => poNumbersOf(db, batch));
    pos.sort((a, b) => byNumber(a.poNumber, b.poNumber));
    for (const { id } of pos) yield* mapped(items(eq(po.id, id), { dir: "asc" }, BY_PO_NUMBER), reportColumns);
  }

  return {
    pendingRows,
    reconciliationRows,

    /** The pending-items workbook (legacy "Items Summary") for the tab's filters and sort. */
    async pendingExport(query: PendingQuery) {
      const { from, to } = query;
      const fileName = EXPORTS.pending.fileName(from !== undefined && to !== undefined ? { from, to } : undefined);
      const { rows, total } = summaryRows(query);
      return summaryFile(fileName, await summaryHeading(fmtDateDashed(clock.today())), rows, total);
    },

    /** The daily dispatch summary for the range, today without one; the heading's date is the range's. */
    async dispatchExport(query: DispatchQuery) {
      const range = dispatchRange(query, clock.today());
      const dates = [...new Set([range.from, range.to])].map((date) => fmtDateDashed(date)).join(" to ");
      const { rows, total } = dispatchSummaryRows(dispatchRows(query, range));
      return summaryFile(EXPORTS.dispatch.fileName(range), await summaryHeading(dates), rows, total);
    },

    /** The reconciliation workbook for the tab's filters and sort; one PO's is named after it (EC-42). */
    async reconciliationExport(query: ReconciliationQuery) {
      const { reconciliation } = EXPORTS;
      let fileName = reconciliation.fileName();
      if (query.poId !== undefined) {
        const [found] = await poNumbersOf(db, [query.poId]);
        if (found === undefined) throw poNotFound();
        fileName = reconciliation.fileName(found.poNumber);
      }
      return xlsxFile(reconciliation, mapped(reconciliationRows(query), reconciliationCells), fileName);
    },

    /** The selected POs' reconciliation rows (SPEC-13 §2, EC-43). */
    exportSelected(body: ExportSelectedBody) {
      return xlsxFile(EXPORTS.exportSelected, mapped(selectedRows(body), reconciliationCells));
    },

    /** The SPEC-12 guarantee-certificate workbook of the chosen DC, reached from the reports screen. */
    async guaranteeCertificate({ dcId }: DcIdQuery) {
      const [found, items, profile] = await Promise.all([
        findDcWithPo(db, dcId),
        itemsOfDc(db, dcId),
        findSupplier(db),
      ]);
      if (found === undefined) throw dcNotFound();
      if (profile === null) throw onboardingRequired();
      const { dc, po: dcPo } = found;
      return gcFile(EXPORTS.guaranteeCertificate.fileName(dc.number), { profile, dc, po: dcPo, items });
    },

    async pending(query: PendingQuery & Paged) {
      const rows = items(pendingWhere(query), query, BY_PO_NUMBER, LIST_READ_PAGE);
      const { items: page, total } = await pageOfRows(rows, query);
      return { items: await withDocuments(page), total };
    },
    reconciliation: (query: ReconciliationQuery & Paged) =>
      pageOfRows(reconciliationRows(query, LIST_READ_PAGE), query),
    async dispatch(query: DispatchQuery & Paged) {
      const rows = dispatchRows(query, dispatchRange(query, clock.today()), LIST_READ_PAGE);
      const { items: page, total } = await pageOfRows(rows, query);
      return { items: page.map(dispatchColumns), total };
    },
  };
}

export type ReportsService = ReturnType<typeof reportsService>;
