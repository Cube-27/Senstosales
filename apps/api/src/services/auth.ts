// The simple login (ARCHITECTURE §10.1, INV-80, A-17): one user `admin`, password only. No user row means the legacy
// default password `admin` (D-0004): the first login creates the row, and reset-to-defaults removes it. Change
// password and reset end every session, as legacy. No backoff, no complexity rule, no forced change (C11).
import { WriteBatch, type Instant, type Statement } from "@senstosales/db";
import type { SQL } from "drizzle-orm";

import { AuthError, fieldError } from "../errors.ts";
import { newId } from "../ids.ts";
import * as repo from "../repositories/auth.ts";
import { ACTOR, audit as auditEntry } from "./audit.ts";
import type { ServiceDeps } from "./index.ts";
import { hashPassword, hashToken, newToken, verifyPassword } from "./password.ts";

const USERNAME = ACTOR;
const DEFAULT_PASSWORD = "admin";
/** The legacy confirmation phrase for reset-to-defaults. */
const RESET_PHRASE = "RESET TO DEFAULTS";
/** A session lasts as long as the legacy cookie: one year. */
export const SESSION_SECONDS = 365 * 24 * 60 * 60;

export interface Session {
  authenticated: boolean;
  isDefaultPassword: boolean;
}

type Action = "app_user.login" | "app_user.logout" | "app_user.change_password" | "app_user.reset_defaults";

const isDefault = (user: repo.User | null): boolean => user?.passwordChangedAt == null;

async function passwordMatches(user: repo.User | null, password: string): Promise<boolean> {
  return user === null ? password === DEFAULT_PASSWORD : verifyPassword(password, user.passwordHash);
}

const wrongPassword = () => new AuthError("wrong-password", "The password is not correct.");

const wrongCurrentPassword = () =>
  fieldError("wrong-password", "currentPassword", "The current password is not correct.");

const addSeconds = (at: Instant, seconds: number): Instant =>
  new Date(Date.parse(at) + seconds * 1000).toISOString() as Instant;

export function createAuthService({ db, clock }: ServiceDeps) {
  const audit = (action: Action, userId: string | SQL<string>, at: Instant): Statement =>
    auditEntry(db, at, { action, entityType: "app_user", entityId: userId });

  async function signedIn(token: string | undefined): Promise<boolean> {
    return token !== undefined && repo.hasSession(db, await hashToken(token), clock.now());
  }

  return {
    signedIn,

    async session(token: string | undefined): Promise<Session> {
      const [authenticated, user] = await Promise.all([signedIn(token), repo.findUser(db, USERNAME)]);
      return { authenticated, isDefaultPassword: isDefault(user) };
    },

    /** Starts a session and returns its token for the cookie. The first login creates the user row. */
    async login(password: string): Promise<{ token: string; session: Session }> {
      const user = await repo.findUser(db, USERNAME);
      if (!(await passwordMatches(user, password))) throw wrongPassword();
      const now = clock.now();
      const batch = new WriteBatch(db);
      if (user === null) {
        const passwordHash = await hashPassword(DEFAULT_PASSWORD);
        batch.add(
          repo.insertUserIfMissing(db, { id: newId(), username: USERNAME, passwordHash, passwordChangedAt: null }),
        );
      }
      // Resolved in the batch: an overlapping first login may have created the row with another id.
      const userId = user?.id ?? repo.userIdOf(USERNAME);
      const token = newToken();
      const expiresAt = addSeconds(now, SESSION_SECONDS);
      batch
        // A password changed since the check above ended every session; this login must not start one after it.
        .add(repo.assertPasswordUnchanged(db, USERNAME, user?.passwordHash ?? null))
        .add(repo.deleteExpiredSessions(db, now))
        .add(
          repo.insertSession(db, { id: newId(), userId, tokenHash: await hashToken(token), createdAt: now, expiresAt }),
        )
        .add(audit("app_user.login", userId, now));
      try {
        await batch.commit();
      } catch (err) {
        if (repo.isPasswordChanged(err)) throw wrongPassword();
        throw err;
      }
      return { token, session: { authenticated: true, isDefaultPassword: isDefault(user) } };
    },

    /** Ends the session of `token`; the session guard has checked it is live, so the user row exists. */
    async logout(token: string): Promise<void> {
      const user = await repo.findUser(db, USERNAME);
      if (user === null) return;
      await new WriteBatch(db)
        .add(repo.deleteSession(db, await hashToken(token)))
        .add(audit("app_user.logout", user.id, clock.now()))
        .commit();
    },

    async changePassword({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) {
      const user = await repo.findUser(db, USERNAME);
      if (user === null || !(await verifyPassword(currentPassword, user.passwordHash))) throw wrongCurrentPassword();
      const now = clock.now();
      await new WriteBatch(db)
        .add(
          repo.updatePassword(db, user.id, { passwordHash: await hashPassword(newPassword), passwordChangedAt: now }),
        )
        .add(repo.deleteAllSessions(db))
        .add(audit("app_user.change_password", user.id, now))
        .commit();
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
        throw wrongCurrentPassword();
      }
      // With no user row the defaults are already in place.
      if (user === null) return;
      await new WriteBatch(db)
        .add(repo.deleteAllSessions(db))
        .add(repo.deleteUser(db, user.id))
        .add(audit("app_user.reset_defaults", user.id, clock.now()))
        .commit();
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
