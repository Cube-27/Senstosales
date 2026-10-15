// The tracker's smart filter chips and stat-card toggles, as the legacy tracker combined them: at most one date chip
// and one value chip; a date chip and a status card exclude each other; pressing an active one turns it off. A chip
// is active when the URL's ranges are its ranges, so the chips need no state of their own.
import type { IsoDate } from "@senstosales/domain";
import { addDays } from "@senstosales/domain";

import type { TrackerStatus, TrackerSearch } from "./search.ts";

export type ChipColor = "default" | "primary" | "warning" | "error" | "success";

/** A change to the URL's filters; `undefined` clears one. */
export type FilterPatch = Partial<Omit<TrackerSearch, "page" | "pageSize" | "sort" | "dir">>;

interface DateChip {
  readonly kind: "date";
  readonly id: string;
  readonly label: string;
  readonly color: ChipColor;
  /** The due-date range from `today`, both ends included. */
  readonly range: (today: IsoDate) => readonly [IsoDate, IsoDate];
}

interface ValueChip {
  readonly kind: "value";
  readonly id: string;
  readonly label: string;
  readonly color: ChipColor;
  /** The lot value floor, in rupees as typed in the filter panel. */
  readonly min: string;
}

export type Chip = DateChip | ValueChip;

export const CHIPS: readonly Chip[] = [
  { kind: "date", id: "today", label: "Due Today", color: "error", range: (t) => [t, t] },
  {
    kind: "date",
    id: "tomorrow",
    label: "Due Tomorrow",
    color: "warning",
    range: (t) => [addDays(t, 1), addDays(t, 1)],
  },
  { kind: "date", id: "this-week", label: "This Week", color: "primary", range: (t) => [t, addDays(t, 7)] },
  {
    kind: "date",
    id: "next-week",
    label: "Next Week",
    color: "default",
    range: (t) => [addDays(t, 7), addDays(t, 14)],
  },
  { kind: "value", id: "high-value", label: "High Value ₹1L+", color: "success", min: "100000" },
  { kind: "value", id: "critical-value", label: "Critical ₹10L+", color: "error", min: "1000000" },
];

/** Whether `chip` is on for the URL's filters. */
export function isActive(chip: Chip, s: TrackerSearch, today: IsoDate): boolean {
  if (chip.kind === "value") return s.valueMin === chip.min && s.valueMax === undefined;
  const [from, to] = chip.range(today);
  return s.dueFrom === from && s.dueTo === to;
}

/** Pressing a chip: on sets its range (a date chip clears the status card), off clears its range. */
export function toggleChip(chip: Chip, s: TrackerSearch, today: IsoDate): FilterPatch {
  const on = !isActive(chip, s, today);
  if (chip.kind === "value") return { valueMin: on ? chip.min : undefined, valueMax: undefined };
  const [from, to] = chip.range(today);
  return on ? { dueFrom: from, dueTo: to, status: undefined } : { dueFrom: undefined, dueTo: undefined };
}

/** Pressing a status card: toggles that status and clears any due-date range. */
export const toggleStatus = (status: TrackerStatus, s: TrackerSearch): FilterPatch => ({
  status: s.status === status ? undefined : status,
  dueFrom: undefined,
  dueTo: undefined,
});

/** Every filter off: Clear all. */
export const CLEARED: FilterPatch = {
  q: undefined,
  status: undefined,
  dueFrom: undefined,
  dueTo: undefined,
  entryFrom: undefined,
  entryTo: undefined,
  valueMin: undefined,
  valueMax: undefined,
};

/** Whether any filter is set: Clear all is enabled. */
export const anyFilter = (s: TrackerSearch): boolean =>
  (Object.keys(CLEARED) as (keyof FilterPatch)[]).some((key) => s[key] !== undefined);
