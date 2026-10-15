// The one query client (ARCHITECTURE §12.1): the previous page stays on screen while the next loads, and an API error
// that means "not signed in" or "not set up" sends the user to that screen (SPEC-14 §4.3).
import { ApiError } from "@senstosales/schemas/errors";
import { keepPreviousData, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

export type AuthRedirect = "/auth/login" | "/onboarding";

/** Where an error sends the user, or null when the screen shows it in place. */
function redirectFor(error: unknown): AuthRedirect | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401) return "/auth/login";
  return error.body.code === "onboarding-required" ? "/onboarding" : null;
}

export function createQueryClient(redirect: (to: AuthRedirect) => void): QueryClient {
  const onError = (error: unknown): void => {
    const to = redirectFor(error);
    if (to) redirect(to);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      // The API answered: asking again gets the same answer. Network failures still retry.
      queries: {
        placeholderData: keepPreviousData,
        retry: (count, error) => !(error instanceof ApiError) && count < 3,
      },
    },
  });
}
