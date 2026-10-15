// List paging shared by the API's list queries and the web pager, without zod (INV-104).

/** The legacy pager's page sizes; 10 is its default. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
