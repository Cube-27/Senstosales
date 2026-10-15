// The root route (SPEC-14 §4.1). Screens read through the query client in the router context; the shell (PR 4)
// adds the app chrome around the outlet.
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()();
