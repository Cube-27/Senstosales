// The /reports tabs (SPEC-13 §2): pending items and reconciliation, as paged lists and as the ordered rows their
// exports write. Both read the same keyset order, so a list's rows are its export's rows (SPEC-13 PR 5). Values are
// the stored ones as they stand (INV-61); Accepted is the item's received quantity (A2-8, INV-09).
import type { Db } from "@senstosales/db";
import { po, poItem } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { addDays, TOL } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { SQL } from "drizzle-orm";
import { and, eq, gt, gte, lte } from "drizzle-orm";
import type { z } from "zod";

import type { Clock } from "../ports/clock.ts";
import type { Keyset } from "../repositories/keyset.ts";
import { keysetRows, listKey } from "../repositories/keyset.ts";
import type { ReportItem } from "../repositories/reports.ts";
import {
  BY_NEWEST_PO,
  BY_PO_NUMBER,
  DOCUMENTS_BATCH,
  itemDocuments,
  REPORT_SORTS,
  reportColumns,
  reportItems,
} from "../repositories/reports.ts";
import { LIST_READ_PAGE, pageOfRows } from "./paging.ts";

type PendingQuery = z.output<(typeof routes)["reports.pendingExport"]["query"]>;
type ReconciliationQuery = z.output<(typeof routes)["reports.reconciliationExport"]["query"]>;
type Paged = { page: number; pageSize: number };

/** Legacy's reconciliation tab without a full date range: the 30 days to today. */
const DEFAULT_RANGE_DAYS = 30;

const dated = (from: IsoDate | undefined, to: IsoDate | undefined): SQL | undefined =>
  and(from === undefined ? undefined : gte(po.poDate, from), to === undefined ? undefined : lte(po.poDate, to));

/**
 * Pending: dated in the range with quantity still to supply, `gtTol(balance, 0)` (INV-02) as legacy's
 * `balance > 0.001`, read in SQL so items with nothing to supply are never fetched.
 */
const pendingWhere = (q: PendingQuery) => and(dated(q.from, q.to), gt(poItem.balanceQty, TOL));

/** One PO (EC-42), the range, or without both range ends the 30 days to today, as the legacy tab. */
function reconciliationWhere(q: ReconciliationQuery, today: IsoDate) {
  if (q.poId !== undefined) return eq(po.id, q.poId);
  if (q.from === undefined || q.to === undefined) return dated(addDays(today, -DEFAULT_RANGE_DAYS), today);
  return dated(q.from, q.to);
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

  return {
    pendingRows,
    reconciliationRows,
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
