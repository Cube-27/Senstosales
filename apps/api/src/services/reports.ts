// The /reports tabs (SPEC-13 §2): pending items and reconciliation, as paged lists and as the workbooks their exports
// write, plus export-selected. A list and its export read the same keyset order, so a list's rows are its export's
// rows (SPEC-13 PR 5). Values are the stored ones as they stand (INV-61); Accepted is the item's received quantity
// (A2-8, INV-09). No export has a flag column (INV-60).
import type { Db } from "@senstosales/db";
import { po, poItem } from "@senstosales/db";
import { EXPORTS } from "@senstosales/documents/catalog";
import type { IsoDate, Qty } from "@senstosales/domain";
import { addDays, qtyToString, sumQty, TOL } from "@senstosales/domain";
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
import type { ReportItem } from "../repositories/reports.ts";
import {
  BY_NEWEST_PO,
  BY_PO_NUMBER,
  DOCUMENTS_BATCH,
  itemDocuments,
  poNumbersOf,
  REPORT_SORTS,
  reportColumns,
  reportItems,
} from "../repositories/reports.ts";
import { contains, inBatches } from "../repositories/sql.ts";
import { findSupplier } from "../repositories/supplier.ts";
import { gcFile, mapped, summaryFile, xlsxFile } from "./exports.ts";
import { byNumber, LIST_READ_PAGE, pageOfRows } from "./paging.ts";

type PendingQuery = z.output<(typeof routes)["reports.pendingExport"]["query"]>;
type ReconciliationQuery = z.output<(typeof routes)["reports.reconciliationExport"]["query"]>;
type ExportSelectedBody = z.output<(typeof routes)["reports.exportSelected"]["body"]>;
type DcIdQuery = z.output<(typeof routes)["reports.guaranteeCertificateExport"]["query"]>;
type Paged = { page: number; pageSize: number };

/** Legacy's reconciliation tab without a full date range: the 30 days to today. */
const DEFAULT_RANGE_DAYS = 30;

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

/** One PO (EC-42), the range, or without both range ends the 30 days to today, as the legacy tab. */
function reconciliationScope(q: ReconciliationQuery, today: IsoDate) {
  if (q.poId !== undefined) return eq(po.id, q.poId);
  if (q.from === undefined || q.to === undefined) return dated(addDays(today, -DEFAULT_RANGE_DAYS), today);
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
    const gemc = (n: string | null) => (n?.trim() ? [n] : []);
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

  /** The pending summary's heading: the install's supplier and today's IST date. */
  async function summaryHeading() {
    const supplier = await findSupplier(db);
    return {
      "supplier contact": supplier?.contact ?? "",
      "supplier name": supplier?.name ?? "",
      // No v1 column (EC-41).
      "supplier description": "",
      "supplier address": supplier?.address ?? "",
      "export date DD-MM-YYYY": fmtDateDashed(clock.today()),
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
        // A missing description falls back as legacy's query did.
        description: foldRepeatedLines(r.description ?? r.materialCode ?? "No Description"),
        qty: `${qtyToString(r.ordQty)} ${r.unit ?? ""}`.trim(),
        // No v1 column (EC-41).
        packets: 0,
        poNumber: r.poNumber,
        gemcNumber: r.gemcNumbers.join(","),
        invoiceNumbers: r.invoices.map((i) => i.number).join(","),
        dcNumbers: r.dcs.map((d) => d.number).join(","),
        dspQty: qtyNumber(r.dspQty),
      };
    });
    return { rows, total: () => summaryTotal(ordered, units) };
  }

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
      return summaryFile(fileName, await summaryHeading(), rows, total);
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
  };
}

export type ReportsService = ReturnType<typeof reportsService>;
