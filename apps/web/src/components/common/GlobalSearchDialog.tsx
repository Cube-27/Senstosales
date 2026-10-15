// The global search dialog's frame (SPEC-14 shell; SPEC-15 PR 5 adds the results, preview, filters and saved
// searches). The panes keep one size whatever they hold, so results never move the frame (C8).
import { Content, Description, Overlay, Portal, Root, Title } from "@radix-ui/react-dialog";
import { useState } from "react";

import { cn } from "../../lib/cn.ts";
import { Bookmark, Filter, Search } from "../../lib/icons.ts";

export interface GlobalSearchDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  readonly query: string;
  onQueryChange(query: string): void;
}

const TOGGLE = "ml-1 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors";
const toggleState = (on: boolean): string =>
  on ? "bg-primary/10 text-accent" : "text-tertiary hover:bg-surface-sunken hover:text-foreground";

export function GlobalSearchDialog({ open, onOpenChange, query, onQueryChange }: GlobalSearchDialogProps) {
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
              className="h-8 flex-1 bg-transparent role-body-text outline-none placeholder:text-placeholder"
            />
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle filters"
              aria-label="Toggle filters"
              aria-pressed={showFilters}
              className={cn(TOGGLE, toggleState(showFilters))}
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

          <div className="flex h-[min(60vh,480px)] overflow-hidden">
            <div className="w-2/5 overflow-y-auto border-r border-border bg-surface-sunken/30">
              <div className="px-4 py-16 text-center">
                <p className="role-empty-text">Type to search</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-surface" />
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
