// The global search (SPEC-14 shell; SPEC-15 PR 5 wires the query, results and preview). The dialog keeps one size
// whatever its panes hold, so loading and results never move the frame (C8).
import { Content, Description, Overlay, Portal, Root, Title } from "@radix-ui/react-dialog";
import { type ReactNode, useEffect, useState } from "react";

import { cn } from "../../lib/cn.ts";
import { Bookmark, Filter, Loading, Search } from "../../lib/icons.ts";

export interface GlobalSearchDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  readonly query: string;
  onQueryChange(query: string): void;
  readonly loading?: boolean;
  /** The left pane: recent searches, results, or the empty text. */
  readonly results?: ReactNode;
  /** The right pane: the selected result's preview. */
  readonly preview?: ReactNode;
  /** The filters panel, shown under the input while the filter toggle is on. */
  readonly filters?: ReactNode;
  /** The saved-searches panel, shown while its toggle is on. */
  readonly saved?: ReactNode;
}

const TOGGLE = "ml-1 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors";
const toggleState = (on: boolean): string =>
  on ? "bg-primary/10 text-accent" : "text-tertiary hover:bg-surface-sunken hover:text-foreground";

export function GlobalSearchDialog(props: GlobalSearchDialogProps) {
  const { open, onOpenChange, query, onQueryChange, loading = false, results, preview, filters, saved } = props;
  const [showFilters, setShowFilters] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Content className="fixed top-[5%] left-1/2 z-50 flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl outline-none">
          <Title className="sr-only">Quick Search</Title>
          <Description className="sr-only">
            Search across purchase orders, delivery challans, invoices, and SRVs with filters
          </Description>

          <div className="flex items-center border-b border-border px-4 py-3">
            <Search className="mr-3 size-4 shrink-0 text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search POs, Challans, Invoices or SRVs..."
              aria-label="Search POs, Challans, Invoices or SRVs"
              className="h-8 flex-1 bg-transparent role-body-text outline-none placeholder:text-[color:var(--text-placeholder)]"
            />
            <Loading className={cn("ml-2 size-4 animate-spin text-accent", !loading && "invisible")} />
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle filters"
              aria-label="Toggle filters"
              aria-pressed={showFilters}
              className={cn(TOGGLE, "ml-2", toggleState(showFilters))}
            >
              <Filter className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowSaved(!showSaved)}
              title="Saved searches"
              aria-label="Saved searches"
              aria-pressed={showSaved}
              className={cn(TOGGLE, toggleState(showSaved))}
            >
              <Bookmark className="size-4" />
            </button>
            <kbd className="ml-2 hidden h-6 items-center rounded border border-border bg-surface-sunken px-2 role-helper-text sm:inline-flex">
              ESC
            </kbd>
          </div>

          {showFilters && <div className="border-b border-border bg-surface-sunken/30 px-4 py-3">{filters}</div>}
          {showSaved && <div className="border-b border-border bg-surface-sunken/30 px-4 py-3">{saved}</div>}

          <div className="flex h-[min(60vh,480px)] overflow-hidden">
            <div className="w-2/5 overflow-y-auto border-r border-border bg-surface-sunken/30">
              {results ?? (
                <div className="px-4 py-16 text-center">
                  <p className="role-empty-text">Type to search</p>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto bg-surface">{preview}</div>
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
        </Content>
      </Portal>
    </Root>
  );
}

/** The header's search box: opens the dialog on click or Ctrl/⌘+K. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-[280px] items-center gap-2 rounded-md border border-border bg-surface-sunken/40 px-3 text-muted transition-colors hover:bg-surface-sunken/70 hover:text-foreground"
      >
        <Search className="size-4 shrink-0 text-tertiary" />
        <span className="min-w-0 flex-1 truncate text-left role-body-text">Search...</span>
        <kbd className="ml-auto hidden h-5 min-w-8 shrink-0 items-center justify-center rounded border border-border bg-surface-sunken px-1.5 role-metadata sm:inline-flex">
          ⌘K
        </kbd>
      </button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} query={query} onQueryChange={setQuery} />
    </>
  );
}
