// The `admin` row and its sessions (ARCHITECTURE §10.1): reads return plain rows, writes return statements for the
// service's batch.
import { appUser, session, type Db, type Instant, type Statement } from "@senstosales/db";
import { and, eq, gt, lte } from "drizzle-orm";

export type User = typeof appUser.$inferSelect;

export async function findUser(db: Db, username: string): Promise<User | null> {
  const rows = await db.query(db.build.select().from(appUser).where(eq(appUser.username, username)).limit(1));
  return rows[0] ?? null;
}

/** Whether a session with this token hash is still live at `now`. */
export async function hasSession(db: Db, tokenHash: string, now: Instant): Promise<boolean> {
  const rows = await db.query(
    db.build
      .select({ id: session.id })
      .from(session)
      .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, now)))
      .limit(1),
  );
  return rows.length > 0;
}

export const insertUser = (db: Db, user: User): Statement => db.build.insert(appUser).values(user);

export const updatePassword = (
  db: Db,
  userId: string,
  values: Pick<User, "passwordHash" | "passwordChangedAt">,
): Statement => db.build.update(appUser).set(values).where(eq(appUser.id, userId));

export const deleteUser = (db: Db, userId: string): Statement => db.build.delete(appUser).where(eq(appUser.id, userId));

export const insertSession = (db: Db, row: typeof session.$inferInsert): Statement =>
  db.build.insert(session).values(row);

export const deleteSession = (db: Db, tokenHash: string): Statement =>
  db.build.delete(session).where(eq(session.tokenHash, tokenHash));

export const deleteExpiredSessions = (db: Db, now: Instant): Statement =>
  db.build.delete(session).where(lte(session.expiresAt, now));

export const deleteAllSessions = (db: Db): Statement => db.build.delete(session);
