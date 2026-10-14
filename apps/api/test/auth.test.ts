// SPEC-07 PR 4: the simple `admin` login (INV-80, A-17, A2-11): login, remember-me, logout, session, change
// password and reset-to-defaults (EC-08). No backoff and no complexity rule (C11).
import { appUser, auditLog, session, type Db, type Instant } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { Clock } from "../src/ports/clock.ts";
import { authRoutes } from "../src/routes/auth.ts";
import { createServices } from "../src/services/index.ts";
import { migratedDb } from "./db.ts";
import { json, testApp } from "./helpers.ts";

const START = "2025-04-01T05:30:00.000Z";
const TOKEN_COOKIE = /^session=([0-9a-f]{64}); Path=\/; HttpOnly; SameSite=Strict$/;
const REMEMBER_COOKIE = /^session=([0-9a-f]{64}); Max-Age=31536000; Path=\/; HttpOnly; SameSite=Strict$/;
const CLEARED_COOKIE = "session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict";
const SIGNED_OUT = { code: "signed-out", message: "Please log in." };
const WRONG_LOGIN = { code: "wrong-password", message: "The password is not correct." };

let open: NodeDb[] = [];
afterEach(() => {
  for (const db of open) db.close();
  open = [];
});

/**
 * An app over a migrated in-memory DB with no supplier and no user row, as on first run; `clock.at` moves time. The
 * services see the DB through `wrap`.
 */
async function setup(wrap: (db: Db) => Db = (db) => db) {
  const db = await migratedDb();
  open.push(db);
  const clock: Clock & { at: string } = {
    at: START,
    now: () => clock.at as Instant,
    today: () => {
      throw new Error("not used");
    },
  };
  const { auth } = createServices({ db: wrap(db), clock, jobs: { enqueue: () => {} } });
  const t = testApp({ ...authRoutes(auth), "buyers.list": () => [] }, auth.signedIn);

  const login = (password: string, rememberMe = false) =>
    t.send("/api/auth/login", json("POST", { password, rememberMe }));
  /** Logs in and returns the cookie pair to send back. */
  const signIn = async (password = "admin") => {
    const res = await login(password);
    expect(res.status).toBe(200);
    return `session=${TOKEN_COOKIE.exec(res.headers.get("set-cookie") ?? "")?.[1]}`;
  };
  /** A GET, or a JSON POST when `body` is given, with the session cookie when given. */
  const call = (path: string, { body, cookie }: { body?: unknown; cookie?: string | undefined } = {}) => {
    const init = body === undefined ? { method: "GET" } : json("POST", body);
    const headers = new Headers(init.headers);
    if (cookie !== undefined) headers.set("cookie", cookie);
    return t.send(path, { ...init, headers });
  };
  const buyers = async (cookie?: string) => (await call("/api/buyers", { cookie })).status;
  const sessionOf = async (cookie?: string) => (await call("/api/auth/session", { cookie })).json();
  const post = (path: string, body: unknown, cookie?: string) => call(path, { body, cookie });
  const auditActions = async () =>
    (await db.query(db.build.select({ action: auditLog.action }).from(auditLog).orderBy(auditLog.id))).map(
      (r) => r.action,
    );
  return { db, clock, login, signIn, buyers, session: sessionOf, post, auditActions };
}

describe("login and session (INV-80, A2-11)", () => {
  it("starts signed out with the default password", async () => {
    const { session, buyers } = await setup();
    expect(await session()).toEqual({ authenticated: false, isDefaultPassword: true });
    expect(await buyers()).toBe(401);
  });

  it("refuses a route that needs a session with the plain signed-out body", async () => {
    const { send } = testApp({ "buyers.list": () => [] }, () => Promise.resolve(false));
    const res = await send("/api/buyers");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(SIGNED_OUT);
  });

  it("refuses a wrong password with 401 and sets no cookie", async () => {
    const { login } = await setup();
    const res = await login("wrong");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(WRONG_LOGIN);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("logs in with the default password `admin` into a browser-session cookie", async () => {
    const { login, session, buyers } = await setup();
    const res = await login("admin");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true, isDefaultPassword: true });
    const token = TOKEN_COOKIE.exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await session(`session=${token}`)).toEqual({ authenticated: true, isDefaultPassword: true });
    expect(await buyers(`session=${token}`)).toBe(200);
  });

  it("keeps the cookie for a year with remember-me", async () => {
    const { login, buyers } = await setup();
    const res = await login("admin", true);
    const token = REMEMBER_COOKIE.exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await buyers(`session=${token}`)).toBe(200);
  });

  it("refuses an unknown token and a session older than a year", async () => {
    const { signIn, buyers, clock } = await setup();
    const cookie = await signIn();
    expect(await buyers(`session=${"0".repeat(64)}`)).toBe(401);
    clock.at = "2026-04-01T05:29:59.000Z";
    expect(await buyers(cookie)).toBe(200);
    clock.at = "2026-04-01T05:30:00.000Z";
    expect(await buyers(cookie)).toBe(401);
  });

  it("logs out: clears the cookie and ends only that session", async () => {
    const { signIn, post, buyers, session } = await setup();
    const first = await signIn();
    const second = await signIn();
    const res = await post("/api/auth/logout", {}, first);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect(await buyers(first)).toBe(401);
    expect(await session(first)).toEqual({ authenticated: false, isDefaultPassword: true });
    expect(await buyers(second)).toBe(200);
  });

  it("needs a session to log out", async () => {
    const { post } = await setup();
    const res = await post("/api/auth/logout", {});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(SIGNED_OUT);
  });

  it("has no backoff: the right password works straight after many wrong ones (C11)", async () => {
    const { login } = await setup();
    for (let i = 0; i < 20; i++) expect((await login(`wrong-${i}`)).status).toBe(401);
    expect((await login("admin")).status).toBe(200);
  });
});

/** A DB whose batches wait until `count` of them were built, then commit in order: overlapping requests. */
function holdBatches(count: number) {
  return (db: Db): Db => {
    const held: (() => void)[] = [];
    return {
      ...db,
      async batch(statements) {
        await new Promise<void>((release) => {
          held.push(release);
          if (held.length === count) for (const r of held) r();
        });
        await db.batch(statements);
      },
    };
  };
}

describe("overlapping first logins", () => {
  it("both succeed when both batches are built before either commits, with one user row", async () => {
    const { db, login, buyers, auditActions } = await setup(holdBatches(2));
    const [first, second] = await Promise.all([login("admin"), login("admin")]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const cookies = [first, second].map(
      (res) => `session=${TOKEN_COOKIE.exec(res.headers.get("set-cookie") ?? "")?.[1]}`,
    );
    expect(await Promise.all(cookies.map((c) => buyers(c)))).toEqual([200, 200]);

    const users = await db.query(db.build.select({ id: appUser.id }).from(appUser));
    expect(users).toHaveLength(1);
    const sessions = await db.query(db.build.select({ userId: session.userId }).from(session));
    const audits = await db.query(db.build.select({ entityId: auditLog.entityId }).from(auditLog));
    expect(sessions.map((s) => s.userId)).toEqual([users[0]?.id, users[0]?.id]);
    expect(audits.map((a) => a.entityId)).toEqual([users[0]?.id, users[0]?.id]);
    expect(await auditActions()).toEqual(["login", "login"]);
  });
});

describe("change password (INV-80)", () => {
  it("ends every session, clears the cookie, and the new password is the only one that works", async () => {
    const { signIn, post, buyers, login, session } = await setup();
    const mine = await signIn();
    const other = await signIn();
    const res = await post(
      "/api/auth/change-password",
      { currentPassword: "admin", newPassword: "x", confirmPassword: "x" },
      mine,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect(await buyers(mine)).toBe(401);
    expect(await buyers(other)).toBe(401);
    expect((await login("admin")).status).toBe(401);
    const again = await login("x");
    expect(await again.json()).toEqual({ authenticated: true, isDefaultPassword: false });
    expect(await session()).toEqual({ authenticated: false, isDefaultPassword: false });
  });

  it("refuses a wrong current password with 400 and keeps the session", async () => {
    const { signIn, post, buyers } = await setup();
    const cookie = await signIn();
    const res = await post(
      "/api/auth/change-password",
      { currentPassword: "nope", newPassword: "new", confirmPassword: "new" },
      cookie,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "wrong-password",
      message: "The current password is not correct.",
      details: { fields: [{ path: "body.currentPassword", message: "The current password is not correct." }] },
    });
    expect(await buyers(cookie)).toBe(200);
  });

  it("needs a session", async () => {
    const { post } = await setup();
    const res = await post("/api/auth/change-password", {
      currentPassword: "admin",
      newPassword: "x",
      confirmPassword: "x",
    });
    expect(res.status).toBe(401);
  });
});

describe("reset to defaults (INV-80, EC-08)", () => {
  const PHRASE = "RESET TO DEFAULTS";
  const WRONG_PHRASE = {
    code: "wrong-phrase",
    message: 'Type "RESET TO DEFAULTS" to continue.',
    details: { fields: [{ path: "body.confirmation", message: 'Type "RESET TO DEFAULTS" to continue.' }] },
  };

  /** A setup whose password was changed to `changed`, with one live session. */
  async function changed() {
    const s = await setup();
    const cookie = await s.signIn();
    await s.post(
      "/api/auth/change-password",
      { currentPassword: "admin", newPassword: "changed", confirmPassword: "changed" },
      cookie,
    );
    return { ...s, cookie: await s.signIn("changed") };
  }

  it("refuses a wrong confirmation phrase", async () => {
    const { post } = await setup();
    const res = await post("/api/auth/reset-defaults", { confirmation: "reset" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(WRONG_PHRASE);
  });

  it("needs only the phrase, with surrounding spaces ignored, while the password is the default", async () => {
    const { post, signIn } = await setup();
    await signIn();
    const res = await post("/api/auth/reset-defaults", { confirmation: `  ${PHRASE} ` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("asks for the current password once it was changed", async () => {
    const { post, buyers, cookie } = await changed();
    const res = await post("/api/auth/reset-defaults", { confirmation: PHRASE });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "current-password-required",
      message: "Enter the current password.",
      details: { fields: [{ path: "body.currentPassword", message: "Enter the current password." }] },
    });
    const wrong = await post("/api/auth/reset-defaults", { confirmation: PHRASE, currentPassword: "admin" });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { code: string }).code).toBe("wrong-password");
    expect(await buyers(cookie)).toBe(200);
  });

  it("restores `admin`, ends every session and clears the cookie", async () => {
    const { post, buyers, login, session, cookie } = await changed();
    const res = await post("/api/auth/reset-defaults", { confirmation: PHRASE, currentPassword: "changed" }, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBe(CLEARED_COOKIE);
    expect(await buyers(cookie)).toBe(401);
    expect(await session()).toEqual({ authenticated: false, isDefaultPassword: true });
    expect((await login("changed")).status).toBe(401);
    expect(await (await login("admin")).json()).toEqual({ authenticated: true, isDefaultPassword: true });
  });
});

describe("stored state", () => {
  it("writes one audit row per write and no password or token anywhere in the database", async () => {
    const { db, signIn, post, auditActions } = await setup();
    const cookie = await signIn();
    await post(
      "/api/auth/change-password",
      { currentPassword: "admin", newPassword: "s3cret-pw", confirmPassword: "s3cret-pw" },
      cookie,
    );
    const again = await signIn("s3cret-pw");
    await post("/api/auth/logout", {}, again);
    await post("/api/auth/reset-defaults", { confirmation: "RESET TO DEFAULTS", currentPassword: "s3cret-pw" });
    expect(await auditActions()).toEqual(["login", "change-password", "login", "logout", "reset-defaults"]);

    const token = again.slice("session=".length);
    const tables = [appUser, session, auditLog].map((table) => db.query(db.build.select().from(table)));
    const everything = JSON.stringify(await Promise.all(tables));
    expect(everything).not.toContain("s3cret-pw");
    expect(everything).not.toContain(token);
  });

  it("hashes the password with PBKDF2-SHA256 (A-17)", async () => {
    const { db, signIn } = await setup();
    await signIn();
    const users = await db.query(db.build.select().from(appUser));
    expect(users.map((u) => u.passwordHash)).toEqual([
      expect.stringMatching(/^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/),
    ]);
  });
});
