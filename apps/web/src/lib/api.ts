// The typed client over the route table (SPEC-04 §4.1), on the page's own origin: the API serves the SPA.
import { createClient, type ReadRouteName, type RouteArgs } from "@senstosales/schemas";
import { queryOptions } from "@tanstack/react-query";

export const api = createClient((url, init) => fetch(url, init));

/** A read as a query, keyed `[resource, params]` (ARCHITECTURE §12.1); the resource is the route's name. */
export function apiQuery<N extends ReadRouteName>(name: N, ...args: RouteArgs<N>) {
  return queryOptions({ queryKey: [name, args[0] ?? {}] as const, queryFn: () => api.request(name, ...args) });
}
