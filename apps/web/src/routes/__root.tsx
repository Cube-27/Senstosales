// The root route (SPEC-14 §4.1): every screen renders inside the app shell. Screens read through the query client
// in the router context. Before any screen loads, the session gate decides whether it may open (SPEC-15 §2).
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { AppChrome } from "../components/common/index.ts";
import { gate } from "../lib/session.ts";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    const { pathname, href, search } = location;
    const returnTo = "redirect" in search ? search.redirect : undefined;
    await gate(context.queryClient, { pathname, href, returnTo });
  },
  component: () => (
    <AppChrome>
      <Outlet />
    </AppChrome>
  ),
});
