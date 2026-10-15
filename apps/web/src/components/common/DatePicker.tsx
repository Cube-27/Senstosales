import { fmtDateInput, parseDateInput } from "@senstosales/schemas/formatters";
import { type ComponentProps, useState } from "react";

import { CalendarIcon } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Calendar } from "../ui/calendar.tsx";
import { Input } from "../ui/input.tsx";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

/** A `YYYY-MM-DD` calendar date (C3). */
type IsoDate = Parameters<typeof fmtDateInput>[0];

export interface DatePickerProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** `YYYY-MM-DD`, or `""` for no date. */
  readonly value: IsoDate | "";
  onChange(value: IsoDate | ""): void;
}

// The calendar works on local `Date`s; they never leave this module, so the app sees only `YYYY-MM-DD` (C3).
const toDate = (d: IsoDate): Date => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromDate = (d: Date): IsoDate | null => parseDateInput(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
const shown = (value: IsoDate | ""): string => (value === "" ? "" : fmtDateInput(value));

/**
 * The legacy date field: type a date in any of the legacy formats (committed on blur or Enter; text that is no
 * date goes back to the current value) or pick one from the calendar button. Escape restores the field, ArrowDown
 * opens the calendar.
 */
export function DatePicker({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Dec 22, 2019",
  "aria-label": ariaLabel,
  onBlur,
  onKeyDown,
  ...props
}: Readonly<DatePickerProps>) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => shown(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(shown(value));
  }

  const date = value === "" ? undefined : toDate(value);

  const commit = (): void => {
    if (text.trim() === "") {
      setText("");
      if (value !== "") onChange("");
      return;
    }
    const typed = parseDateInput(text);
    setText(shown(typed ?? value));
    if (typed !== null && typed !== value) onChange(typed);
  };

  const pick = (date: Date | undefined): void => {
    const picked = (date && fromDate(date)) ?? "";
    setOpen(false);
    setText(shown(picked));
    if (picked !== value) onChange(picked);
  };

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverAnchor asChild>
        <div className={cn("relative w-full", className)}>
          <Input
            {...props}
            type="text"
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            className="pr-9 role-body-text-sm"
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => {
              if (!e.relatedTarget?.closest("[data-datepicker-trigger]")) commit();
              onBlur?.(e);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                setOpen(false);
              } else if (e.key === "ArrowDown" && !open && !disabled) {
                e.preventDefault();
                setOpen(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setText(shown(value));
                setOpen(false);
              }
              onKeyDown?.(e);
            }}
          />
          <PopoverTrigger
            type="button"
            disabled={disabled}
            aria-label={`Open ${ariaLabel ?? "Date input"} calendar`}
            data-datepicker-trigger
            className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm bg-[var(--dp-trigger-bg)] text-[var(--dp-icon-color)] hover:bg-[var(--dp-trigger-bg-hover)] disabled:cursor-not-allowed disabled:opacity-65"
          >
            <CalendarIcon className="size-3.5" aria-hidden />
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto border-0 p-0" align="start" sideOffset={2}>
        <Calendar mode="single" selected={date} {...(date && { defaultMonth: date })} onSelect={pick} />
      </PopoverContent>
    </Popover>
  );
}
