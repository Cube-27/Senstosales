import type { IsoDate } from "@senstosales/domain";
import { useState } from "react";

import { CalendarIcon, Filter, TrendingDown, X } from "../../../lib/icons.ts";
import { Button, DatePicker, Input, Popover, PopoverContent, PopoverTrigger } from "../../common/index.ts";
import type { FilterPatch } from "./chips.ts";
import type { TrackerSearch } from "./search.ts";

export interface TrackerFiltersProps {
  readonly search: TrackerSearch;
  onChange(patch: FilterPatch): void;
  /** Clear All Filters: every filter and the search text. */
  onClear(): void;
  readonly canClear: boolean;
}

const orNone = <T extends string>(v: T | ""): T | undefined => (v === "" ? undefined : v);

interface RangeProps {
  readonly label: string;
  readonly icon: typeof Filter;
  readonly children: readonly [React.ReactNode, React.ReactNode];
}

function Range({ label, icon: Icon, children: [from, to] }: RangeProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 role-field-label">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <div className="flex items-center gap-2">
        {from}
        <span className="shrink-0 role-metadata">to</span>
        {to}
      </div>
    </div>
  );
}

/**
 * More Filters: the legacy advanced panel (due date, entry date and lot value ranges, Clear All Filters). It opens as
 * a popover over the list, so opening it moves nothing (C8), where the legacy panel pushed the table down.
 */
export function TrackerFilters({ search, onChange, onClear, canClear }: TrackerFiltersProps) {
  const [open, setOpen] = useState(false);
  const date = (key: "dueFrom" | "dueTo" | "entryFrom" | "entryTo", label: string, placeholder: string) => (
    <DatePicker
      value={search[key] ?? ""}
      // A typed due date replaces a status card, as the legacy panel did.
      onChange={(v: IsoDate | "") =>
        onChange(key.startsWith("due") ? { [key]: orNone(v), status: undefined } : { [key]: orNone(v) })
      }
      placeholder={placeholder}
      aria-label={label}
      className="w-36"
    />
  );
  const amount = (key: "valueMin" | "valueMax", label: string, placeholder: string) => (
    <Input
      inputMode="decimal"
      value={search[key] ?? ""}
      onChange={(e) => onChange({ [key]: orNone(e.target.value) })}
      placeholder={placeholder}
      aria-label={label}
      className="w-36 text-right"
    />
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={open ? "default" : "outline"}
          size="sm"
          className="w-32"
          title="Set date range, entry date, or value filters"
        >
          <Filter aria-hidden />
          {open ? "Hide Filters" : "More Filters"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto px-4 py-3">
        <p className="mb-3 role-field-label">Advanced Filters</p>
        <div className="flex flex-col gap-4">
          <Range label="Due Date Range" icon={CalendarIcon}>
            {[date("dueFrom", "Due date from", "From"), date("dueTo", "Due date to", "To")]}
          </Range>
          <Range label="Entry Date Range" icon={CalendarIcon}>
            {[date("entryFrom", "Entry date from", "From"), date("entryTo", "Entry date to", "To")]}
          </Range>
          <Range label="Lot Value (₹)" icon={TrendingDown}>
            {[amount("valueMin", "Lot value from", "Min"), amount("valueMax", "Lot value to", "Max")]}
          </Range>
        </div>
        <div className="mt-3 flex justify-end border-t border-border/60 pt-2">
          <Button variant="outline" size="sm" onClick={onClear} disabled={!canClear}>
            <X aria-hidden />
            Clear All Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
