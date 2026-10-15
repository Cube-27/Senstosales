// `/reports`' URL search (SPEC-14 §2): the tab, paging, the tab's sort, the search text and the date range. Without a
// range the tabs show the current FY to today (owner, 2026-10-15; legacy showed yesterday to today).
import type { IsoDate } from "@senstosales/domain";
import { fyStartOf } from "@senstosales/domain";
import { routes, zIsoDate } from "@senstosales/schemas";
import { z } from "zod";

import { sortIn, zUrlText } from "../../../lib/search.ts";

const zPendingSort = routes["reports.pending"].query.shape.sort.unwrap();
const zReconciliationSort = routes["reports.reconciliation"].query.shape.sort.unwrap();
const zDispatchSort = routes["reports.dispatch"].query.shape.sort.unwrap();

export const zReportsSearch = routes["reports.pending"].query.pick({ page: true, pageSize: true, dir: true }).extend({
  /** The Audit Ledger or Daily Dispatch tab; the Items Summary (pending) tab without it. */
  tab: z.enum(["reconciliation", "dispatch"]).optional(),
  sort: z.union([zPendingSort, zReconciliationSort, zDispatchSort]).optional(),
  q: zUrlText,
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
});

export type ReportsSearch = z.output<typeof zReportsSearch>;

/** The search's sort for the pending tab, or none when it names a reconciliation column. */
export const pendingSort = sortIn(zPendingSort.options);

/** The search's sort for the reconciliation tab, or none when it names a pending column. */
export const reconciliationSort = sortIn(zReconciliationSort.options);

/** The search's sort for the daily dispatch tab, or none when it names another tab's column. */
export const dispatchSort = sortIn(zDispatchSort.options);

/** The tabs' default range: the start of `today`'s FY, to `today`, so the screen is never empty for want of recent POs. */
export const defaultRange = (today: IsoDate) => ({ from: fyStartOf(today), to: today });
