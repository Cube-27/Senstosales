// Global search (SPEC-10 PR 6).
import type { Handlers } from "../app.ts";
import type { SearchService } from "../services/search.ts";

export function searchRoutes(search: SearchService) {
  return { "search.query": ({ query }) => search.query(query) } satisfies Handlers;
}
