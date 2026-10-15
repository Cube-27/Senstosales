// The root route (SPEC-14 §4.1): every screen renders inside the app shell. Screens read through the query client
// in the router context. Before any screen loads, the session gate decides whether it may open (SPEC-15 §2).
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";

import { AppChrome } from "../components/common/index.ts";
import { gate, LOGIN, ONBOARDING } from "../lib/session.ts";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    const { pathname, href, search } = location;
    const returnTo = "redirect" in search ? search.redirect : undefined;
    const to = await gate(context.queryClient, { pathname, href, returnTo });
    if (to === null) return;
    switch (to.kind) {
      case "onboarding":
        throw redirect({ to: ONBOARDING });
      case "page":
        throw redirect({ href: to.href });
      case "login":
        throw redirect({ to: LOGIN, search: { redirect: to.redirect } });
      default: {
        const _exhaustive: never = to;
        return _exhaustive;
      }
    }
  },
  component: () => (
    <AppChrome>
      <Outlet />
    </AppChrome>
  ),
});
