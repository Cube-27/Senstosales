import type { NodeDb } from "@senstosales/db/node";
import { createClient } from "@senstosales/schemas";

import type { AppDeps, Handlers } from "../src/app.ts";
import { createApp } from "../src/app.ts";
import type { LogFields, Logger } from "../src/ports/logger.ts";

export const PORT = 41234;
export const HOST = `127.0.0.1:${PORT}`;
export const ID = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";

export interface LogLine {
  level: keyof Logger;
  fields: LogFields;
  message: string;
}

/** A logger that keeps every line, so a test can read what was logged. */
export function memoryLogger(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = [];
  const at =
    (level: keyof Logger) =>
    (fields: LogFields, message: string): void => {
      lines.push({ level, fields, message });
    };
  return { lines, debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}

/**
 * An app on the test port with `handlers`; `send` adds the loopback Host unless the test sets one, and `client` is
 * the typed web client over `send`, as the SPA calls it. Every request is signed in, and onboarding done, unless
 * `signedIn` or `onboarded` says otherwise.
 */
export function testApp(
  handlers: Handlers = {},
  signedIn: AppDeps["signedIn"] = () => Promise.resolve(true),
  onboarded: AppDeps["onboarded"] = () => Promise.resolve(true),
) {
  const logger = memoryLogger();
  const app = createApp({ port: PORT, logger, signedIn, onboarded }, handlers);
  const send = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (!headers.has("host")) headers.set("host", HOST);
    return Promise.resolve(app.request(`http://${HOST}${path}`, { ...init, headers }));
  };
  return { app, send, client: createClient(send), logger };
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** The most parameters one statement bound while `run` ran, read or written; D1 binds at most 100 (C4). */
export async function mostBoundParams(db: NodeDb, run: () => Promise<unknown>): Promise<number> {
  let most = 0;
  // Every statement the repositories and services send is a drizzle query builder.
  const bound = (statement: unknown) => {
    most = Math.max(most, (statement as { toSQL(): { params: unknown[] } }).toSQL().params.length);
  };
  const { query, batch } = db;
  db.query = ((statement: Parameters<typeof query>[0]) => {
    bound(statement);
    return query.call(db, statement);
  }) as typeof db.query;
  db.batch = ((statements: Parameters<typeof batch>[0]) => {
    for (const statement of statements) bound(statement);
    return batch.call(db, statements);
  }) as typeof db.batch;
  try {
    await run();
  } finally {
    db.query = query;
    db.batch = batch;
  }
  return most;
}

/** A promise the test resolves, to hold work at a point until it calls `open`. */
export function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}
