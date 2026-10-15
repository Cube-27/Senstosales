// shadcn/ui Calendar (MIT, see NOTICE) on react-day-picker, restyled to the legacy date-picker tokens (`--dp-*` in
// globals.css): previous/next month buttons, month and year choosers, the today ring and the selected cell.
import type { ComponentProps } from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { ChevronDown, ChevronLeft, ChevronRight } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";

const NAV_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-sm text-[var(--dp-icon-color)] hover:bg-[var(--dp-cell-hover-bg)] aria-disabled:opacity-50";

function Calendar({ className, classNames, ...props }: ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays
      captionLayout="dropdown"
      className={cn(
        "rounded-sm border border-[var(--dp-panel-border)] bg-[var(--dp-panel-bg)] p-3 text-[var(--dp-cell-text)]",
        className,
      )}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between", defaults.nav),
        button_previous: cn(NAV_BUTTON, defaults.button_previous),
        button_next: cn(NAV_BUTTON, defaults.button_next),
        month_caption: cn("flex h-8 w-full items-center justify-center px-8", defaults.month_caption),
        dropdowns: cn("flex h-8 items-center justify-center gap-1.5", defaults.dropdowns),
        dropdown_root: cn("relative rounded-sm hover:bg-[var(--dp-cell-hover-bg)]", defaults.dropdown_root),
        dropdown: cn("absolute inset-0 cursor-pointer opacity-0", defaults.dropdown),
        caption_label: cn(
          "flex h-8 items-center gap-1 rounded-sm px-2 role-datepicker-header-button",
          defaults.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("flex-1 py-1 text-center role-datepicker-weekday", defaults.weekday),
        week: cn("mt-1 flex w-full gap-1", defaults.week),
        day: cn("relative size-8 p-0 text-center select-none", defaults.day),
        day_button: cn(
          "size-8 rounded-sm border border-transparent bg-[var(--dp-cell-bg)] role-body-text-sm tabular-nums hover:bg-[var(--dp-cell-hover-bg)]",
          defaults.day_button,
        ),
        today: cn("[&>button]:border-2 [&>button]:border-[var(--dp-cell-today-ring)]", defaults.today),
        selected: cn(
          "[&>button]:border-[var(--dp-cell-selected-bg)] [&>button]:bg-[var(--dp-cell-selected-bg)] [&>button]:text-[var(--dp-cell-selected-text)]",
          defaults.selected,
        ),
        outside: cn("text-[var(--dp-cell-muted-text)]", defaults.outside),
        disabled: cn("opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevron, orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
          return <Icon className={cn("size-4", chevron)} aria-hidden />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
