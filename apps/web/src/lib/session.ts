// Where a screen may open (SPEC-15 §2): with no supplier only `/onboarding` (INV-78), after onboarding never it;
// without a session only the login, which returns to the page asked for. The API stays the authority: a 401 or
// `onboarding-required` from any later call sends the user back here (`onAuthError`).
import type { QueryClient } from "@tanstack/react-query";
import { type AnyRouter, redirect } from "@tanstack/react-router";

import { apiQuery } from "./api.ts";
import type { AuthRedirect } from "./query.ts";

export const sessionQuery = apiQuery("auth.session");
export const onboardingQuery = apiQuery("onboarding.status");

export const LOGIN = "/auth/login" satisfies AuthRedirect;
export const ONBOARDING = "/onboarding" satisfies AuthRedirect;

/** A return path only within the app: a `//host` or absolute URL would leave it, and the login never returns to itself. */
export function safeReturn(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path === LOGIN || path.startsWith(`${LOGIN}?`) ? "/" : path;
}

/** Lets the page asked for open, or throws the redirect to where the user must go first. `pathname` is the page
 * asked for, `href` it with its search, `returnTo` the login's `redirect` search value. */
export async function gate(
  queryClient: QueryClient,
  { pathname, href, returnTo }: { pathname: string; href: string; returnTo?: unknown },
): Promise<void> {
  const { required } = await queryClient.ensureQueryData(onboardingQuery);
  if (required) {
    if (pathname !== ONBOARDING) throw redirect({ to: ONBOARDING });
    return;
  }
  if (pathname === ONBOARDING) throw redirect({ to: "/" });
  const { authenticated } = await queryClient.ensureQueryData(sessionQuery);
  if (pathname === LOGIN) {
    if (authenticated) throw redirect({ href: safeReturn(returnTo) });
  } else if (!authenticated) {
    throw redirect({ to: LOGIN, search: { redirect: href } });
  }
}

/** A 401 or `onboarding-required` from the API: forget what the gate knew, then send the user to that screen. */
export function onAuthError(queryClient: QueryClient, router: AnyRouter, to: AuthRedirect): void {
  queryClient.removeQueries({ queryKey: (to === LOGIN ? sessionQuery : onboardingQuery).queryKey });
  const search = to === LOGIN ? { redirect: safeReturn(router.state.location.href) } : {};
  void router.navigate({ to, search });
}
