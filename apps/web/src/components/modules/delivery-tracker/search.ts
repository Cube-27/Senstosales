// `/delivery-tracker`'s URL search (SPEC-14 §2): paging, sort, the stat-card status, the search text and the filter
// panel's ranges. The smart chips have no state of their own: a chip is on when the ranges are its ranges.
import { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { money, searchText, zUrlText } from "../../../lib/search.ts";

export const zTrackerSearch = routes["deliveryTracker.list"].query
  .pick({
    page: true,
    pageSize: true,
    sort: true,
    dir: true,
    status: true,
    dueFrom: true,
    dueTo: true,
    entryFrom: true,
    entryTo: true,
  })
  .extend({ q: zUrlText, valueMin: zUrlText, valueMax: zUrlText });

export type TrackerSearch = z.output<typeof zTrackerSearch>;

/** A stat card's status filter. */
export type TrackerStatus = NonNullable<TrackerSearch["status"]>;

/** The tracker's filters as the list, stats and export queries take them. */
export const trackerFilters = (s: TrackerSearch) => ({
  q: searchText(s.q),
  status: s.status,
  dueFrom: s.dueFrom,
  dueTo: s.dueTo,
  entryFrom: s.entryFrom,
  entryTo: s.entryTo,
  valueMin: money(s.valueMin),
  valueMax: money(s.valueMax),
});
