import { useNavigate, useSearch } from "@tanstack/react-router";

/** The paging and sort part of every list's query (SPEC-04 `zListQuery`); the rest of a list's search is filters. */
export interface ListSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string | undefined;
  readonly dir: "asc" | "desc";
}

export type ListFilters<S extends ListSearch> = Omit<S, keyof ListSearch>;

export interface ListSearchApi<S extends ListSearch> {
  readonly search: S;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  toggleSort(key: string): void;
  /** Merges filters into the URL and goes back to page 1. */
  setFilters(filters: Partial<ListFilters<S>>): void;
  /** The paging and sort props of the list's DataTable. */
  readonly table: {
    readonly page: number;
    readonly pageSize: number;
    readonly sort: { readonly key: string; readonly dir: "asc" | "desc" } | undefined;
    onPage(page: number): void;
    onPageSize(pageSize: number): void;
    onSort(key: string): void;
  };
}

/** The page that keeps the first row on screen when the page size changes, as the legacy table did. */
export const pageForSize = (page: number, from: number, to: number): number => Math.floor(((page - 1) * from) / to) + 1;

/** The next sort: a new column sorts ascending, the same column flips (legacy `setSort`). */
export function nextSort(search: ListSearch, key: string): Pick<ListSearch, "sort" | "dir"> {
  if (search.sort !== key) return { sort: key, dir: "asc" };
  return { sort: key, dir: search.dir === "asc" ? "desc" : "asc" };
}

/**
 * A list screen's page, page size, sort and filters, held in the URL (SPEC-14 §2): the route validates its search
 * with the list's query schema, so a link or a reload shows the same page. Every change replaces the history entry,
 * as the legacy table did; a sort or filter change goes back to page 1.
 */
export function useListSearch<S extends ListSearch>(): ListSearchApi<S> {
  // The route's `validateSearch` parsed this search with the list's schema, so it has the shape `S`.
  const parsed: unknown = useSearch({ strict: false });
  const search = parsed as S;
  const navigate = useNavigate();
  const update = (paging: Partial<ListSearch>, filters?: Partial<ListFilters<S>>): void => {
    void navigate({ to: ".", search: (prev: object) => ({ ...prev, ...filters, ...paging }), replace: true });
  };
  const setPage = (page: number): void => update({ page });
  const setPageSize = (pageSize: number): void =>
    update({ pageSize, page: pageForSize(search.page, search.pageSize, pageSize) });
  const toggleSort = (key: string): void => update({ ...nextSort(search, key), page: 1 });
  return {
    search,
    setPage,
    setPageSize,
    toggleSort,
    setFilters: (filters) => update({ page: 1 }, filters),
    table: {
      page: search.page,
      pageSize: search.pageSize,
      sort: search.sort === undefined ? undefined : { key: search.sort, dir: search.dir },
      onPage: setPage,
      onPageSize: setPageSize,
      onSort: toggleSort,
    },
  };
}
