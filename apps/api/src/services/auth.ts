// The simple login (ARCHITECTURE §10.1, INV-80, A-17): one user `admin`, password only. Until the first login there
// is no user row and the password is the legacy default `admin` (D-0004). Change password and reset-to-defaults end
// every session, as legacy. No backoff, no complexity rule, no forced change (C11).
import { WriteBatch, type Db, type Instant, type Statement } from "@senstosales/db";

import { AuthError, ValidationError } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import { insertAudit } from "../repositories/audit.ts";
import * as repo from "../repositories/auth.ts";
import { newId } from "./ids.ts";
import { hashPassword, hashToken, newToken, verifyPassword } from "./password.ts";

const USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";
/** The legacy confirmation phrase for reset-to-defaults. */
const RESET_PHRASE = "RESET TO DEFAULTS";
/** A session lasts as long as the legacy cookie: one year. */
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;

export interface AuthDeps {
  readonly db: Db;
  readonly clock: Clock;
}

export interface Session {
  authenticated: boolean;
  isDefaultPassword: boolean;
}

type Action = "login" | "logout" | "change-password" | "reset-defaults";

const isDefault = (user: repo.User | null): boolean => user?.passwordChangedAt == null;

/** No user row yet means the default password. */
async function passwordMatches(user: repo.User | null, password: string): Promise<boolean> {
  return user === null ? password === DEFAULT_PASSWORD : verifyPassword(password, user.passwordHash);
}

/** A 400 naming the field, so the settings form can show it there. */
function fieldError(code: string, field: string, message: string): ValidationError {
  return new ValidationError(code, message, { fields: [{ path: `body.${field}`, message }] });
}

export function createAuthService({ db, clock }: AuthDeps) {
  const audit = (action: Action, userId: string, at: Instant): Statement =>
    insertAudit(db, { id: newId(), at, actor: USERNAME, action, entityType: "app_user", entityId: userId });

  /** Sets the password and ends every session, in one batch with its audit row. */
  async function replacePassword(user: repo.User, password: string, action: Action): Promise<void> {
    const now = clock.now();
    const passwordChangedAt = action === "reset-defaults" ? null : now;
    await new WriteBatch(db)
      .add(repo.updatePassword(db, user.id, { passwordHash: await hashPassword(password), passwordChangedAt }))
      .add(repo.deleteAllSessions(db))
      .add(audit(action, user.id, now))
      .commit();
  }

  async function signedIn(token: string | undefined): Promise<boolean> {
    return token !== undefined && repo.hasSession(db, await hashToken(token), clock.now());
  }

  return {
    signedIn,

    async session(token: string | undefined): Promise<Session> {
      return { authenticated: await signedIn(token), isDefaultPassword: isDefault(await repo.findUser(db, USERNAME)) };
    },

    /** Starts a session and returns its token for the cookie. The first login creates the user row. */
    async login(password: string): Promise<{ token: string; session: Session }> {
      const user = await repo.findUser(db, USERNAME);
      if (!(await passwordMatches(user, password))) {
        throw new AuthError("wrong-password", "The password is not correct.");
      }
      const now = clock.now();
      const batch = new WriteBatch(db);
      let userId = user?.id;
      if (userId === undefined) {
        userId = newId();
        const passwordHash = await hashPassword(DEFAULT_PASSWORD);
        batch.add(repo.insertUser(db, { id: userId, username: USERNAME, passwordHash, passwordChangedAt: null }));
      }
      const token = newToken();
      const expiresAt = new Date(Date.parse(now) + SESSION_MS).toISOString() as Instant;
      await batch
        .add(repo.deleteExpiredSessions(db, now))
        .add(
          repo.insertSession(db, { id: newId(), userId, tokenHash: await hashToken(token), createdAt: now, expiresAt }),
        )
        .add(audit("login", userId, now))
        .commit();
      return { token, session: { authenticated: true, isDefaultPassword: isDefault(user) } };
    },

    /** Ends the session of `token`; the session guard has checked it is live. */
    async logout(token: string): Promise<void> {
      const user = await repo.findUser(db, USERNAME);
      if (user === null) return;
      await new WriteBatch(db)
        .add(repo.deleteSession(db, await hashToken(token)))
        .add(audit("logout", user.id, clock.now()))
        .commit();
    },

    async changePassword({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) {
      const user = await repo.findUser(db, USERNAME);
      if (user === null || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw fieldError("wrong-password", "currentPassword", "The current password is not correct.");
      }
      await replacePassword(user, newPassword, "change-password");
    },

    /** The legacy reset: the phrase, plus the current password once it was changed (EC-08). */
    async resetDefaults({
      confirmation,
      currentPassword,
    }: {
      confirmation: string;
      currentPassword?: string | undefined;
    }) {
      if (confirmation.trim() !== RESET_PHRASE) {
        throw fieldError("wrong-phrase", "confirmation", `Type "${RESET_PHRASE}" to continue.`);
      }
      const user = await repo.findUser(db, USERNAME);
      if (currentPassword === undefined && !isDefault(user)) {
        throw fieldError("current-password-required", "currentPassword", "Enter the current password.");
      }
      if (currentPassword !== undefined && !(await passwordMatches(user, currentPassword))) {
        throw fieldError("wrong-password", "currentPassword", "The current password is not correct.");
      }
      // With no user row nothing was ever stored, so the defaults are already in place.
      if (user !== null) await replacePassword(user, DEFAULT_PASSWORD, "reset-defaults");
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
