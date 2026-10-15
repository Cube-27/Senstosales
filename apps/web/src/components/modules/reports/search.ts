// `/reports`' URL search (SPEC-14 §2): the tab, paging, the tab's sort, the search text and the date range. Without a
// range the tabs show the legacy default, yesterday to today.
import type { IsoDate } from "@senstosales/domain";
import { addDays } from "@senstosales/domain";
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

/** The legacy tabs' default range: the day before `today`, to `today`. */
export const defaultRange = (today: IsoDate) => ({ from: addDays(today, -1), to: today });
