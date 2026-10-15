// Global search (SPEC-15 PR 5): searches PO, DC, invoice and SRV numbers as the user types (debounced), with the
// legacy filters, recent and saved searches, keyboard selection and a preview. Opening a hit or a linked document
// goes to its page and closes the dialog. While a search runs the previous results stay (C8).
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useRef, useState } from "react";

import { SEARCH_DELAY_MS } from "../../../hooks/useSearchText.ts";
import { apiQuery } from "../../../lib/api.ts";
import { GlobalSearchDialog } from "../../common/index.ts";
import { DOC } from "../documents.ts";
import { type Filters, hasActiveFilters, isSearchable, NO_FILTERS, searchQuery } from "./filters.ts";
import { type RecentSearch, type SavedSearch, useSearchHistory } from "./history.ts";
import { FiltersPanel, SavedPanel, SaveSearchBox } from "./SearchPanels.tsx";
import { Preview, ResultList, type Target } from "./SearchParts.tsx";

interface Typed {
  readonly q: string;
  readonly filters: Filters;
}

/** What the user typed, and the same once it has stood for `ms`: each change restarts the wait. */
function useDebounced<T>(initial: T, ms: number) {
  const [state, setState] = useState({ typed: initial, settled: initial });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const set = (update: (typed: T) => T): void => {
    clearTimeout(timer.current);
    setState((s) => ({ ...s, typed: update(s.typed) }));
    timer.current = setTimeout(() => setState((s) => (s.settled === s.typed ? s : { ...s, settled: s.typed })), ms);
  };
  return [state, set] as const;
}

interface SearchDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<"filters" | "saved" | null>(null);
  const [saving, setSaving] = useState(false);
  const history = useSearchHistory();

  // Typed text and typed amounts both wait for the debounce; one request per pause.
  const [{ typed, settled }, setTyped] = useDebounced<Typed>({ q: "", filters: NO_FILTERS }, SEARCH_DELAY_MS);
  const { q: query, filters } = typed;
  const setQuery = (q: string): void => setTyped((t) => ({ ...t, q }));
  const setFilters = (next: Filters): void => setTyped((t) => ({ ...t, filters: next }));
  const { q } = settled;
  const searchable = isSearchable(q, settled.filters);
  const search = useQuery({
    ...apiQuery("search.query", { query: searchQuery(q, settled.filters) }),
    // A search that answered with text is remembered (legacy recent searches).
    meta: { onSuccess: () => q.trim() !== "" && history.addRecent(q.trim(), settled.filters) },
    enabled: open && searchable,
  });
  const searching = query.trim() !== "" || hasActiveFilters(filters);
  const hits = searchable ? (search.data ?? []) : [];

  // The selection belongs to the results it was made in: new results start at the first hit.
  const [choice, setChoice] = useState({ hits: search.data, index: 0 });
  const selected = choice.hits === search.data ? choice.index : 0;
  const setSelected = (index: number): void => setChoice({ hits: search.data, index });

  const openTarget = ({ type, id }: Target): void => {
    onOpenChange(false);
    setQuery("");
    void navigate({ to: DOC[type].page, params: { id } });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (hits.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected((selected + step + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[selected]) {
      e.preventDefault();
      openTarget(hits[selected]);
    }
  };

  const loadRecent = (r: RecentSearch): void => setTyped(() => ({ q: r.query, filters: r.filters }));
  const loadSaved = (s: SavedSearch): void => {
    setFilters(s.filters);
    setPanel(null);
  };

  const panels = {
    filters: (
      <FiltersPanel
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(NO_FILTERS)}
        onSave={() => setSaving(true)}
      />
    ),
    saved: <SavedPanel saved={history.saved} onLoad={loadSaved} onDelete={history.remove} />,
  };

  return (
    <GlobalSearchDialog
      open={open}
      onOpenChange={onOpenChange}
      query={query}
      onQueryChange={setQuery}
      loading={search.isFetching}
      filtersPressed={panel === "filters" || hasActiveFilters(filters)}
      onToggleFilters={() => setPanel((p) => (p === "filters" ? null : "filters"))}
      savedPressed={panel === "saved"}
      onToggleSaved={() => setPanel((p) => (p === "saved" ? null : "saved"))}
      panel={panel === null ? undefined : panels[panel]}
      onKeyDown={onKeyDown}
      results={
        <ResultList
          hits={hits}
          searching={searching}
          searchable={searchable}
          loading={search.isFetching || settled !== typed}
          selected={selected}
          recent={history.recent}
          onHover={setSelected}
          onOpen={openTarget}
          onRecent={loadRecent}
        />
      }
      preview={<Preview hit={hits[selected]} onOpen={openTarget} />}
      overlay={
        saving ? (
          <SaveSearchBox
            onSave={(name) => {
              history.save(name, filters);
              setSaving(false);
            }}
            onCancel={() => setSaving(false)}
          />
        ) : undefined
      }
    />
  );
}
