// The global search dialog's frame (SPEC-14 shell): the search box with its loading slot and the Filters and Saved
// toggles, the results and preview panes, and the footer. SPEC-15 PR 5 fills it (`components/modules/search`). The
// panes keep one size whatever they hold, and the filter and saved panels open over the panes, so loading, results
// and toggles never move or resize the frame (C8).
import { Dialog } from "radix-ui";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "../../lib/cn.ts";
import { Bookmark, Filter, Loading, Search } from "../../lib/icons.ts";

export interface GlobalSearchDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  readonly query: string;
  onQueryChange(query: string): void;
  readonly loading: boolean;
  /** The Filters toggle shows pressed while its panel is open or a filter is set. */
  readonly filtersPressed: boolean;
  onToggleFilters(): void;
  readonly savedPressed: boolean;
  onToggleSaved(): void;
  /** Shown over the top of the panes (the filter or saved-searches panel). */
  readonly panel?: ReactNode;
  readonly results: ReactNode;
  readonly preview: ReactNode;
  /** Shown over the whole dialog (the save-search box). */
  readonly overlay?: ReactNode;
  onKeyDown?(event: KeyboardEvent): void;
}

const TOGGLE = "ml-1 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors";
const toggleState = (on: boolean): string =>
  on ? "bg-primary/10 text-accent" : "text-tertiary hover:bg-surface-sunken hover:text-foreground";

export function GlobalSearchDialog(props: GlobalSearchDialogProps) {
  const { open, onOpenChange, query, onQueryChange, loading, filtersPressed, savedPressed } = props;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          onKeyDown={props.onKeyDown}
          className="fixed top-[5%] left-1/2 z-50 flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl outline-none"
        >
          <Dialog.Title className="sr-only">Quick Search</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search across purchase orders, delivery challans, invoices, and SRVs with filters
          </Dialog.Description>

          <div className="flex items-center border-b border-border px-4 py-3">
            <Search className="mr-3 size-4 shrink-0 text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search POs, Challans, Invoices or SRVs..."
              aria-label="Search POs, Challans, Invoices or SRVs"
              className="h-8 flex-1 bg-transparent role-body-text outline-none placeholder:text-placeholder"
            />
            <Loading
              aria-hidden={!loading}
              aria-label={loading ? "Searching" : undefined}
              className={cn("ml-2 size-4 shrink-0 animate-spin text-accent", !loading && "invisible")}
            />
            <button
              type="button"
              onClick={props.onToggleFilters}
              title="Toggle filters"
              aria-label="Toggle filters"
              aria-pressed={filtersPressed}
              className={cn(TOGGLE, toggleState(filtersPressed))}
            >
              <Filter className="size-4" />
            </button>
            <button
              type="button"
              onClick={props.onToggleSaved}
              title="Saved searches"
              aria-label="Saved searches"
              aria-pressed={savedPressed}
              className={cn(TOGGLE, toggleState(savedPressed))}
            >
              <Bookmark className="size-4" />
            </button>
            <kbd className="ml-2 hidden h-6 items-center rounded border border-border bg-surface-sunken px-2 role-helper-text sm:inline-flex">
              ESC
            </kbd>
          </div>

          <div className="relative flex h-[min(60vh,480px)] overflow-hidden">
            <div className="w-2/5 overflow-y-auto border-r border-border bg-surface-sunken/30">{props.results}</div>
            <div className="flex-1 overflow-y-auto bg-surface">{props.preview}</div>
            {props.panel && (
              <div className="absolute inset-x-0 top-0 z-10 max-h-full overflow-y-auto border-b border-border bg-surface shadow-lg">
                {props.panel}
              </div>
            )}
          </div>

          <div className="flex justify-between border-t border-border bg-surface-sunken/30 px-4 py-2 role-helper-text">
            <div className="flex items-center gap-4">
              <span>
                <kbd className="mr-1 rounded border border-border bg-surface px-1.5">↑↓</kbd> Navigate
              </span>
              <span>
                <kbd className="mr-1 rounded border border-border bg-surface px-1.5">↵</kbd> Select
              </span>
            </div>
            <span>SenstoSearch</span>
          </div>

          {props.overlay && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              {props.overlay}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
