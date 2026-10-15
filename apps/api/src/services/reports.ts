// The /reports tabs (SPEC-13 §2): pending items and reconciliation, as paged lists and as the ordered rows their
// exports write. Both read the same keyset order, so a list's rows are its export's rows (SPEC-13 PR 5). Values are
// the stored ones as they stand (INV-61); Accepted is the item's received quantity (A2-8, INV-09).
import type { Db } from "@senstosales/db";
import { po } from "@senstosales/db";
import type { IsoDate, Qty } from "@senstosales/domain";
import { addDays, gtTol } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { SQL } from "drizzle-orm";
import { and, eq, gte, lte } from "drizzle-orm";
import type { z } from "zod";

import type { Clock } from "../ports/clock.ts";
import type { Keyset } from "../repositories/keyset.ts";
import { keysetRows, listKey } from "../repositories/keyset.ts";
import type { ReportItem } from "../repositories/reports.ts";
import {
  BY_NEWEST_PO,
  BY_PO_NUMBER,
  itemDocuments,
  REPORT_PAGE,
  REPORT_SORTS,
  reportItems,
} from "../repositories/reports.ts";
import { pageOfRows } from "./paging.ts";

type PendingQuery = z.output<(typeof routes)["reports.pendingExport"]["query"]>;
type ReconciliationQuery = z.output<(typeof routes)["reports.reconciliationExport"]["query"]>;

/** Legacy's reconciliation tab without a full date range: the 30 days to today. */
const DEFAULT_RANGE_DAYS = 30;

const NONE = 0 as Qty;

const dated = (from: IsoDate | undefined, to: IsoDate | undefined): SQL | undefined =>
  and(from === undefined ? undefined : gte(po.poDate, from), to === undefined ? undefined : lte(po.poDate, to));

const reportColumns = ({ kPoNumber: _, kPoDate: __, kDescription: ___, gemcNumber: ____, ...row }: ReportItem) => row;

export function reportsService({ db, clock }: { db: Db; clock: Clock }) {
  /** Every row `where` keeps, in the query's sort, then `defaults`. */
  const items = (
    where: SQL | undefined,
    query: { sort?: keyof typeof REPORT_SORTS | undefined; dir: "asc" | "desc" },
    defaults: Keyset<ReportItem>,
  ) => keysetRows(listKey(REPORT_SORTS, defaults, query), (page) => reportItems(db, where, page), REPORT_PAGE);

  /** PO items dated in the range with quantity still to supply; PO number then item number by default. */
  async function* pendingItems(query: PendingQuery) {
    for await (const item of items(dated(query.from, query.to), query, BY_PO_NUMBER)) {
      if (gtTol(item.balanceQty, NONE)) yield item;
    }
  }

  /** The pending rows in order, their documents read a page of items at a time. */
  async function* pendingRows(query: PendingQuery) {
    let page: ReportItem[] = [];
    for await (const item of pendingItems(query)) {
      page.push(item);
      if (page.length === REPORT_PAGE) {
        yield* await withDocuments(page);
        page = [];
      }
    }
    yield* await withDocuments(page);
  }

  /** Each item with the DCs and invoices raised on it; GEMC numbers are its invoices', else its PO's (legacy). */
  async function withDocuments(page: readonly ReportItem[]) {
    const docs = await itemDocuments(
      db,
      page.map((item) => item.poItemId),
    );
    return page.map((item) => {
      const own = <T extends { poItemId: string }>(refs: readonly T[]) =>
        refs.filter((ref) => ref.poItemId === item.poItemId).map(({ poItemId: _, ...ref }) => ref);
      const invoices = own(docs.invoices);
      const invoiceGemc = [...new Set(invoices.flatMap((i) => (i.gemcNumber?.trim() ? [i.gemcNumber] : [])))];
      const poGemc = item.gemcNumber?.trim() ? [item.gemcNumber] : [];
      return {
        ...reportColumns(item),
        gemcNumbers: invoiceGemc.length > 0 ? invoiceGemc : poGemc,
        dcs: own(docs.dcs),
        invoices: invoices.map(({ gemcNumber: _, ...ref }) => ref),
      };
    });
  }

  /**
   * One PO's items (EC-42), or the items of every PO dated in the range, newest PO date first. Without both range
   * ends the range is the 30 days to today, as the legacy tab.
   */
  async function* reconciliationRows(query: ReconciliationQuery) {
    const today = clock.today();
    const where =
      query.poId === undefined
        ? query.from === undefined || query.to === undefined
          ? dated(addDays(today, -DEFAULT_RANGE_DAYS), today)
          : dated(query.from, query.to)
        : eq(po.id, query.poId);
    for await (const item of items(where, query, BY_NEWEST_PO)) yield reportColumns(item);
  }

  return {
    pendingRows,
    reconciliationRows,
    async pending(query: PendingQuery & { page: number; pageSize: number }) {
      const { items: page, total } = await pageOfRows(pendingItems(query), query);
      return { items: await withDocuments(page), total };
    },
    reconciliation: (query: ReconciliationQuery & { page: number; pageSize: number }) =>
      pageOfRows(reconciliationRows(query), query),
  };
}

export type ReportsService = ReturnType<typeof reportsService>;
