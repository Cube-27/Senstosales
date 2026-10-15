// The query client and the router, wired together: an API answer that means "signed out" or "not set up" sends the
// user to that screen through the router (SPEC-14 §4.3, SPEC-15 §2).
import type { RouterHistory } from "@tanstack/react-router";

import { createQueryClient } from "./lib/query.ts";
import { onAuthError } from "./lib/session.ts";
import { createAppRouter } from "./router.ts";

/** `history` is the browser's by default; tests pass a memory history. */
export function createApp(history?: RouterHistory) {
  const queryClient = createQueryClient((to) =>
    onAuthError({
      queryClient,
      navigate: (path, redirect) => void router.navigate({ to: path, search: redirect ? { redirect } : {} }),
      currentHref: () => router.state.location.href,
    })(to),
  );
  const router = createAppRouter(queryClient, history);
  return { queryClient, router };
}
