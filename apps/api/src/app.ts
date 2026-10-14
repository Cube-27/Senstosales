// `createApp(deps, handlers)` (SPEC-07 §4.1): the guards every request passes, the routes of the route table that
// have a handler, and one `onError`. Inputs are decoded and outputs encoded with the table's schemas, so the wire
// format lives only in `packages/schemas` (C3) and handlers see the domain's types.
import type { Download, RouteDef, RouteName, RouteOutput } from "@senstosales/schemas";
import { contentDisposition, routes } from "@senstosales/schemas";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import { AppError, ValidationError } from "./errors.ts";
import { bodyLimit } from "./middleware/body-limit.ts";
import { hostGuard } from "./middleware/host-guard.ts";
import { jsonOnly } from "./middleware/json-only.ts";
import type { Logger } from "./ports/logger.ts";

export interface AppDeps {
  /** The port the server listens on; the Host guard accepts only this port (C10). */
  readonly port: number;
  readonly logger: Logger;
}

type Def<N extends RouteName> = (typeof routes)[N];
type Decoded<D, K extends "params" | "query" | "body"> = D extends { readonly [P in K]: infer S extends z.ZodType }
  ? z.output<S>
  : undefined;

/** What a handler receives: the path ids, the query with its defaults and the body, all decoded. */
export interface HandlerInput<N extends RouteName> {
  readonly params: Decoded<Def<N>, "params">;
  readonly query: Decoded<Def<N>, "query">;
  readonly body: Decoded<Def<N>, "body">;
}

export type Handler<N extends RouteName> = (
  input: HandlerInput<N>,
  c: Context,
) => RouteOutput<N> | Promise<RouteOutput<N>>;

export type Handlers = { readonly [N in RouteName]?: Handler<N> };

type AnyHandler = (input: Record<"params" | "query" | "body", unknown>, c: Context) => unknown;

const INTERNAL = { code: "internal", message: "Something went wrong. Please try again." };
const NOT_FOUND = { code: "not-found", message: "This page or item was not found." };

export function createApp(deps: AppDeps, handlers: Handlers): Hono {
  const app = new Hono();
  app.use(hostGuard(deps.port), jsonOnly, bodyLimit);
  // In the table's order, not the caller's: Hono matches in registration order, and the table lists fixed segments
  // (`/api/po/stats`) before ids (`/api/po/:id`).
  for (const [name, def] of Object.entries(routes)) {
    // `Handlers` pairs each route name with its handler type; indexing by a string loses that pairing.
    const handler = handlers[name as RouteName] as AnyHandler | undefined;
    if (handler) mount(app, def, handler);
  }
  app.notFound((c) => c.json(NOT_FOUND, 404));
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toBody(), err.status);
    deps.logger.error(
      { method: c.req.method, path: c.req.path, error: String(err), stack: err.stack },
      "request failed",
    );
    return c.json(INTERNAL, 500);
  });
  return app;
}

function mount(app: Hono, def: RouteDef, handler: AnyHandler): void {
  app.on(def.method, def.path, async (c) => {
    const input = {
      params: def.params && decode("params", def.params, c.req.param()),
      query: def.query && decode("query", def.query, readQuery(c)),
      body: def.body && decode("body", def.body, await readJson(c)),
    };
    const output = await handler(input, c);
    return def.response === "file" ? sendFile(c, output as Download) : c.json(z.encode(def.response, output));
  });
}

/** Decodes one part of the request; a failure names each field by its path, never echoing the value. */
function decode(part: string, schema: z.ZodType, value: unknown): unknown {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join("."),
    message: issue.message,
  }));
  throw new ValidationError("invalid-input", "Some details are missing or not valid.", { fields });
}

/** A repeated key (`types=po&types=dc`) is an array; a single one is a string (D-0106). */
function readQuery(c: Context): Record<string, string | string[]> {
  const entries = Object.entries(c.req.queries()).map(([key, values]): [string, string | string[]] => [
    key,
    values.length === 1 && values[0] !== undefined ? values[0] : values,
  ]);
  return Object.fromEntries(entries);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError("bad-json", "The request could not be read.");
  }
}

/** A download named by `Content-Disposition` (D-0105). */
function sendFile(c: Context, file: Download): Response {
  // `Response` takes only bytes backed by a plain ArrayBuffer; copy only a view of a shared one.
  const bytes = file.bytes.buffer instanceof ArrayBuffer ? (file.bytes as Uint8Array<ArrayBuffer>) : file.bytes.slice();
  return c.body(bytes, 200, {
    "content-type": "application/octet-stream",
    "content-disposition": contentDisposition(file.fileName),
  });
}
