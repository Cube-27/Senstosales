// The header's search box: opens the search dialog on click or Ctrl/⌘+K. The dialog (SPEC-15 search, and Radix
// Dialog with it) loads on the first open, keeping it out of the shell bundle (INV-104).
import { lazy, Suspense, useCallback, useState } from "react";

import { Search } from "../../lib/icons.ts";

const SearchDialog = lazy(() =>
  import("../modules/search/SearchDialog.tsx").then((m) => ({ default: m.SearchDialog })),
);

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);

  const show = (next: boolean): void => {
    setOpen(next);
    if (next) setOpened(true);
  };

  // Ctrl/⌘+K works anywhere while the search box is on screen: the listener lives as long as the button.
  const listenForHotkey = useCallback((button: HTMLButtonElement) => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpened(true);
        setOpen((was) => !was);
      }
    };
    button.ownerDocument.addEventListener("keydown", onKey);
    return () => button.ownerDocument.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        ref={listenForHotkey}
        type="button"
        onClick={() => show(true)}
        className="flex h-9 w-full max-w-[280px] items-center gap-2 rounded-md border border-border bg-surface-sunken/40 px-3 text-muted transition-colors hover:bg-surface-sunken/70 hover:text-foreground"
      >
        <Search className="size-4 shrink-0 text-tertiary" />
        <span className="min-w-0 flex-1 truncate text-left role-body-text">Search...</span>
        <kbd className="ml-auto hidden h-5 min-w-8 shrink-0 items-center justify-center rounded border border-border bg-surface-sunken px-1.5 role-metadata sm:inline-flex">
          ⌘K
        </kbd>
      </button>
      {opened && (
        <Suspense fallback={null}>
          <SearchDialog open={open} onOpenChange={show} />
        </Suspense>
      )}
    </>
  );
}
