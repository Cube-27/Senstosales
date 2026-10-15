// Where a screen may open (SPEC-15 §2): with no supplier only `/onboarding` (INV-78), after onboarding never it;
// without a session only the login, which returns to the page asked for. The API stays the authority: a 401 or
// `onboarding-required` from any later call sends the user back here (`onAuthError`).
import type { QueryClient } from "@tanstack/react-query";

import { apiQuery } from "./api.ts";
import type { AuthRedirect } from "./query.ts";

export const sessionQuery = apiQuery("auth.session");
export const onboardingQuery = apiQuery("onboarding.status");

export const LOGIN = "/auth/login";
export const ONBOARDING = "/onboarding";

/** Where the user is sent instead of the page asked for, or null to open it. */
export type Gate =
  | { readonly kind: "onboarding" }
  | { readonly kind: "page"; readonly href: string }
  | { readonly kind: "login"; readonly redirect: string };

/** A return path only within the app: a `//host` or absolute URL would leave it, and the login never returns to itself. */
export function safeReturn(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path === LOGIN || path.startsWith(`${LOGIN}?`) ? "/" : path;
}

/** `pathname` is the page asked for, `href` it with its search, `returnTo` the login's `redirect` search value. */
export async function gate(
  queryClient: QueryClient,
  { pathname, href, returnTo }: { pathname: string; href: string; returnTo?: unknown },
): Promise<Gate | null> {
  const { required } = await queryClient.ensureQueryData(onboardingQuery);
  if (required) return pathname === ONBOARDING ? null : { kind: "onboarding" };
  if (pathname === ONBOARDING) return { kind: "page", href: "/" };
  const { authenticated } = await queryClient.ensureQueryData(sessionQuery);
  if (pathname === LOGIN) return authenticated ? { kind: "page", href: safeReturn(returnTo) } : null;
  return authenticated ? null : { kind: "login", redirect: href };
}

/** A 401 or `onboarding-required` from the API: forget what the gate knew, then send the user to that screen. */
export function onAuthError({
  queryClient,
  navigate,
  currentHref,
}: {
  queryClient: QueryClient;
  navigate: (to: AuthRedirect, redirect: string | undefined) => void;
  currentHref: () => string;
}) {
  return (to: AuthRedirect): void => {
    queryClient.removeQueries({ queryKey: (to === LOGIN ? sessionQuery : onboardingQuery).queryKey });
    navigate(to, to === LOGIN ? safeReturn(currentHref()) : undefined);
  };
}
