// `/reports`' URL search (SPEC-14 §2): the tab, paging, the tab's sort, the search text and the date range. Without a
// range the tabs show the legacy default, yesterday to today.
import type { IsoDate } from "@senstosales/domain";
import { addDays } from "@senstosales/domain";
import { routes, zIsoDate } from "@senstosales/schemas";
import { z } from "zod";

import { zUrlText } from "../../../lib/search.ts";

const zPendingSort = routes["reports.pending"].query.shape.sort.unwrap();
const zReconciliationSort = routes["reports.reconciliation"].query.shape.sort.unwrap();

export const zReportsSearch = routes["reports.pending"].query.pick({ page: true, pageSize: true, dir: true }).extend({
  /** The Audit Ledger tab; the Items Summary (pending) tab without it. */
  tab: z.literal("reconciliation").optional(),
  sort: z.union([zPendingSort, zReconciliationSort]).optional(),
  q: zUrlText,
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
});

export type ReportsSearch = z.output<typeof zReportsSearch>;

const isIn = <T extends string>(options: readonly T[], value: string | undefined): value is T =>
  options.some((o) => o === value);

/** The search's sort for the pending tab, or none when it names a reconciliation column. */
export const pendingSort = (sort: string | undefined) => (isIn(zPendingSort.options, sort) ? sort : undefined);

/** The search's sort for the reconciliation tab, or none when it names a pending column. */
export const reconciliationSort = (sort: string | undefined) =>
  isIn(zReconciliationSort.options, sort) ? sort : undefined;

/** The legacy tabs' default range: the day before `today`, to `today`. */
export const defaultRange = (today: IsoDate) => ({ from: addDays(today, -1), to: today });
