import { useState } from "react";

import { pageForSize } from "./useListSearch.ts";

/** A detail page's rows paged in memory: the DataTable props for the current page. */
export function useClientPage<R>(rows: readonly R[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    state: "ready",
    onPage: setPage,
    onPageSize: (size: number) => {
      setPage(pageForSize(page, pageSize, size));
      setPageSize(size);
    },
    onSort: () => {},
  } as const;
}
