// Global search (SPEC-15 PR 5): searches PO, DC, invoice and SRV numbers as the user types (debounced), with the
// legacy filters, recent and saved searches, keyboard selection and a preview. Opening a hit or a linked document
// goes to its page and closes the dialog. While a search runs the previous results stay (C8).
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useState } from "react";

import { apiQuery } from "../../../lib/api.ts";
import { GlobalSearchDialog } from "../../common/index.ts";
import { type Filters, hasActiveFilters, isSearchable, NO_FILTERS, searchQuery } from "./filters.ts";
import { type RecentSearch, type SavedSearch, useSearchHistory } from "./history.ts";
import { FiltersPanel, SavedPanel, SaveSearchBox } from "./SearchPanels.tsx";
import { Preview, ResultList, type Target } from "./SearchParts.tsx";

/** The legacy waits this long after the last keystroke. */
const DEBOUNCE_MS = 300;

const PAGE: Record<Target["type"], "/po/$id" | "/dc/$id" | "/invoice/$id" | "/srv/$id"> = {
  po: "/po/$id",
  dc: "/dc/$id",
  invoice: "/invoice/$id",
  srv: "/srv/$id",
};

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export interface SearchDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [panel, setPanel] = useState<"filters" | "saved" | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(0);
  const history = useSearchHistory();

  const q = useDebounced(query, DEBOUNCE_MS);
  const searchable = isSearchable(q, filters);
  const search = useQuery({
    ...apiQuery("search.query", { query: searchQuery(q, filters) }),
    enabled: open && searchable,
  });
  const searching = query.trim() !== "" || hasActiveFilters(filters);
  const hits = searchable ? (search.data ?? []) : [];

  // A search that answered with text is remembered (legacy recent searches). Placeholder data is the previous
  // search's answer, still on screen while this one runs.
  const answeredAt = search.isSuccess && !search.isPlaceholderData ? search.dataUpdatedAt : 0;
  const { addRecent } = history;
  useEffect(() => {
    if (answeredAt > 0 && q.trim() !== "") addRecent(q.trim(), filters);
  }, [answeredAt, q, filters, addRecent]);

  useEffect(() => setSelected(0), [search.data]);

  const openTarget = ({ type, id }: Target): void => {
    onOpenChange(false);
    setQuery("");
    void navigate({ to: PAGE[type], params: { id } });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (hits.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected((i) => (i + step + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[selected]) {
      e.preventDefault();
      openTarget(hits[selected]);
    }
  };

  const loadRecent = (r: RecentSearch): void => {
    setQuery(r.query);
    setFilters(r.filters);
  };
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
          loading={search.isFetching || q !== query}
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
