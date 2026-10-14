// The login routes (ARCHITECTURE §10.1): the service decides, these set and clear the session cookie. Without
// "remember me" the cookie ends with the browser session; with it, it lasts a year, as legacy (A2-11).
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import type { Handlers } from "../app.ts";
import { SESSION_COOKIE, sessionToken } from "../middleware/auth.ts";
import type { AuthService } from "../services/auth.ts";

const COOKIE = { path: "/", httpOnly: true, sameSite: "Strict" } as const;
const REMEMBER_SECONDS = 365 * 24 * 60 * 60;
const OK = { ok: true } as const;

/** Change password and reset end every session, this one included, so the UI returns to the login. */
const endSession = (c: Context) => {
  deleteCookie(c, SESSION_COOKIE, COOKIE);
  return OK;
};

type AuthRoute = "auth.login" | "auth.logout" | "auth.session" | "auth.changePassword" | "auth.resetDefaults";

export function authRoutes(auth: AuthService): Required<Pick<Handlers, AuthRoute>> {
  return {
    "auth.login": async ({ body }, c) => {
      const { token, session } = await auth.login(body.password);
      setCookie(c, SESSION_COOKIE, token, body.rememberMe ? { ...COOKIE, maxAge: REMEMBER_SECONDS } : COOKIE);
      return session;
    },
    "auth.logout": async (_input, c) => {
      // The session guard ran first, so the cookie is there.
      await auth.logout(sessionToken(c) ?? "");
      return endSession(c);
    },
    "auth.session": (_input, c) => auth.session(sessionToken(c)),
    "auth.changePassword": async ({ body }, c) => {
      await auth.changePassword(body);
      return endSession(c);
    },
    "auth.resetDefaults": async ({ body }, c) => {
      await auth.resetDefaults(body);
      return endSession(c);
    },
  };
}
