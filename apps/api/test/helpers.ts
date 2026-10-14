import type { Handlers } from "../src/app.ts";
import { createApp } from "../src/app.ts";
import type { LogFields, Logger } from "../src/ports/logger.ts";

export const PORT = 41234;
export const HOST = `127.0.0.1:${PORT}`;

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

/** An app on the test port with `handlers`, and a `send` that adds the loopback Host unless the test sets one. */
export function testApp(handlers: Handlers = {}) {
  const logger = memoryLogger();
  const app = createApp({ port: PORT, logger }, handlers);
  const send = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (!headers.has("host")) headers.set("host", HOST);
    return app.request(`http://${HOST}${path}`, { ...init, headers });
  };
  return { app, send, logger };
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
