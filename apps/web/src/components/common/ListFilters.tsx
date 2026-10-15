import type { IsoDate } from "@senstosales/domain";

import { Filter } from "../../lib/icons.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { orNone } from "../../lib/search.ts";
import { DatePicker } from "./DatePicker.tsx";

/** The legacy filter panel's values: a date range and a value range, the amounts as typed. */
export interface RangeFilters {
  readonly from?: IsoDate | undefined;
  readonly to?: IsoDate | undefined;
  readonly valueMin?: string | undefined;
  readonly valueMax?: string | undefined;
}

export interface ListFiltersProps {
  /** The date range's label, e.g. "PO Date". */
  readonly dateLabel: string;
  readonly value: RangeFilters;
  /** Sets the ranges given; `undefined` clears one. */
  onChange(next: RangeFilters): void;
}

const CLEARED: Required<{ [K in keyof RangeFilters]: undefined }> = {
  from: undefined,
  to: undefined,
  valueMin: undefined,
  valueMax: undefined,
};

const RANGE_KEYS = ["from", "to", "valueMin", "valueMax"] as const satisfies readonly (keyof RangeFilters)[];

/**
 * The lists' Filters button and panel: a date range, a value range and Clear all. The panel opens as a popover over
 * the page, so opening it moves nothing (C8), where the legacy panel slid the table down.
 */
export function ListFilters({ dateLabel, value, onChange }: Readonly<ListFiltersProps>) {
  const active = RANGE_KEYS.some((key) => (value[key] ?? "") !== "");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={active ? "default" : "outline"} size="sm">
          <Filter aria-hidden />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-20 role-field-label">{dateLabel}:</span>
            <DatePicker
              value={value.from ?? ""}
              onChange={(from) => onChange({ from: orNone(from) })}
              placeholder="From"
              aria-label={`${dateLabel} from`}
              className="w-36"
            />
            <span className="text-tertiary" aria-hidden>
              –
            </span>
            <DatePicker
              value={value.to ?? ""}
              onChange={(to) => onChange({ to: orNone(to) })}
              placeholder="To"
              aria-label={`${dateLabel} to`}
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 role-field-label">Value:</span>
            <Input
              inputMode="decimal"
              value={value.valueMin ?? ""}
              onChange={(e) => onChange({ valueMin: orNone(e.target.value) })}
              placeholder="Min"
              aria-label="Value min"
              className="w-36 text-right"
            />
            <span className="text-tertiary" aria-hidden>
              –
            </span>
            <Input
              inputMode="decimal"
              value={value.valueMax ?? ""}
              onChange={(e) => onChange({ valueMax: orNone(e.target.value) })}
              placeholder="Max"
              aria-label="Value max"
              className="w-36 text-right"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onChange(CLEARED)} disabled={!active}>
              Clear all
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
