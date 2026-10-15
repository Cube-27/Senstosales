import type { ReactNode, Ref } from "react";

import { cn } from "../../lib/cn.ts";

export interface ListToolbarProps {
  /** The list's search box; omitted on lists without one. */
  readonly search?: {
    readonly value: string;
    onChange(value: string): void;
    readonly placeholder?: string;
    /** The input element, for a caller that ties work to its lifetime. */
    readonly inputRef?: Ref<HTMLInputElement>;
  };
  /** Filters, toggles and buttons on the right. Each keeps its slot when idle (C8). */
  readonly children?: ReactNode;
}

/** The strip above a list's table: search on the left, the list's own controls on the right. */
export function ListToolbar({ search, children }: ListToolbarProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface-sunken/20 px-4 py-3">
      {search && (
        <div className="min-w-0 flex-1">
          <input
            ref={search.inputRef}
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Search..."}
            aria-label={search.placeholder ?? "Search"}
            className="h-8 w-full rounded-md border border-border bg-surface-sunken px-3 role-body-text placeholder:text-placeholder hover:border-border-strong focus:border-primary"
          />
        </div>
      )}
      {children && (
        <div className={cn("flex min-h-9 min-w-0 items-center gap-2", search ? "shrink-0 justify-end" : "w-full")}>
          {children}
        </div>
      )}
    </div>
  );
}
