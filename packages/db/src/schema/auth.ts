// The one `admin` login and its sessions (ARCHITECTURE §10.1, A-17).
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { instant, ulid } from "../types.ts";

export const appUser = sqliteTable("app_user", {
  id: ulid("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Set once the default password is changed; reset then asks for the current one (EC-08). */
  passwordChangedAt: instant("password_changed_at"),
});

/** Looked up by the hash of the cookie token; the token itself is never stored. */
export const session = sqliteTable("session", {
  id: ulid("id").primaryKey(),
  userId: ulid("user_id")
    .notNull()
    .references(() => appUser.id),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: instant("created_at").notNull(),
  expiresAt: instant("expires_at").notNull(),
});
