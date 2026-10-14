// Session auth (ARCHITECTURE §10.1): a route the table does not mark public answers only with a live session
// cookie. The cookie is `HttpOnly` and `SameSite=Strict`, so another page cannot use it.
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import { AuthError } from "../errors.ts";

/** The cookie that carries the session token (D-0116). */
export const SESSION_COOKIE = "session";

export const sessionToken = (c: Context): string | undefined => getCookie(c, SESSION_COOKIE);

/** The check `createApp` runs first in every non-public route. */
export function requireSession(signedIn: (token: string | undefined) => Promise<boolean>) {
  return async (c: Context): Promise<void> => {
    if (!(await signedIn(sessionToken(c)))) throw new AuthError("signed-out", "Please log in.");
  };
}
