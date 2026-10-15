// The root route (SPEC-14 §4.1): every screen renders inside the app shell. Screens read through the query client
// in the router context.
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { AppChrome } from "../components/common/index.ts";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <AppChrome>
      <Outlet />
    </AppChrome>
  ),
});
