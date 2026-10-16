// `createApp(deps, handlers)` (SPEC-07 §4.1): the guards every request passes, the routes of the route table that
// have a handler, and one `onError`. Inputs are decoded and outputs encoded with the table's schemas, so the wire
// format lives only in `packages/schemas` (C3) and handlers see the domain's types.
import { ConflictError as StaleVersionError } from "@senstosales/db";
import type { Download, RouteDef, RouteName, RouteOutput } from "@senstosales/schemas";
import { contentDisposition, routes } from "@senstosales/schemas";
import type { Context } from "hono";
import { Hono } from "hono";
import { getMimeType, mimes } from "hono/utils/mime";
import { z } from "zod";

import { AppError, onboardingRequired, staleVersion, ValidationError } from "./errors.ts";
import { requireSession } from "./middleware/auth.ts";
import { bodyLimit } from "./middleware/body-limit.ts";
import { hostGuard } from "./middleware/host-guard.ts";
import { jsonOnly } from "./middleware/json-only.ts";
import type { Logger } from "./ports/logger.ts";

export interface AppDeps {
  /** The port the server listens on; the Host guard accepts only this port (C10). */
  readonly port: number;
  readonly logger: Logger;
  /** Whether a session token is live; routes the table does not mark public need one (§10.1). */
  readonly signedIn: (token: string | undefined) => Promise<boolean>;
  /** Whether the supplier exists; until it does, only public routes answer (INV-78). */
  readonly onboarded: () => Promise<boolean>;
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

/** A download streamed as its chunks are pulled (INV-99); an error mid-stream aborts the response (SPEC-13 §4.3). */
export interface StreamedFile {
  readonly fileName: string;
  readonly chunks: AsyncIterable<Uint8Array | string>;
}

/** What a handler returns: a file route answers a whole or a streamed download. */
type HandlerOutput<N extends RouteName> = Def<N>["response"] extends "file" ? Download | StreamedFile : RouteOutput<N>;

export type Handler<N extends RouteName> = (
  input: HandlerInput<N>,
  c: Context,
) => HandlerOutput<N> | Promise<HandlerOutput<N>>;

export type Handlers = { readonly [N in RouteName]?: Handler<N> };

type AnyHandler = (input: Record<"params" | "query" | "body", unknown>, c: Context) => unknown;

const INTERNAL = { code: "internal", message: "Something went wrong. Please try again." };
const NOT_FOUND = { code: "not-found", message: "This page or item was not found." };

export function createApp(deps: AppDeps, handlers: Handlers): Hono {
  const app = new Hono();
  app.use(hostGuard(deps.port), jsonOnly, bodyLimit);
  const requireSignedIn = requireSession(deps.signedIn);
  // Until the supplier exists only public routes answer (INV-78): the onboarding check runs before the session
  // check, since first run has nobody signed in.
  const guard = async (c: Context) => {
    if (!(await deps.onboarded())) throw onboardingRequired();
    await requireSignedIn(c);
  };
  // In the table's order, not the caller's: Hono matches in registration order, and the table lists fixed segments
  // (`/api/po/stats`) before ids (`/api/po/:id`).
  for (const [name, def] of Object.entries<RouteDef>(routes)) {
    // `Handlers` pairs each route name with its handler type; indexing by a string loses that pairing.
    const handler = handlers[name as RouteName] as AnyHandler | undefined;
    if (handler) mount(app, def, handler, def.public ? undefined : guard);
  }
  app.notFound((c) => c.json(NOT_FOUND, 404));
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toBody(), err.status);
    // Any versioned update in a batch that commits after someone else's edit (INV-95).
    if (err instanceof StaleVersionError) return c.json(staleVersion().toBody(), 409);
    deps.logger.error(
      { method: c.req.method, path: c.req.path, error: String(err), stack: err.stack },
      "request failed",
    );
    return c.json(INTERNAL, 500);
  });
  return app;
}

/** Mounts one route; `guard` runs inside the route's own handler, so it can never apply to a different route. */
function mount(app: Hono, def: RouteDef, handler: AnyHandler, guard: ((c: Context) => Promise<void>) | undefined) {
  app.on(def.method, def.path, async (c) => {
    await guard?.(c);
    const input = {
      params: def.params && decode("params", def.params, c.req.param()),
      query: def.query && decode("query", def.query, readQuery(c)),
      body: def.body && decode("body", def.body, await readJson(c)),
    };
    const output = await handler(input, c);
    return def.response === "file"
      ? sendFile(c, output as Download | StreamedFile)
      : c.json(z.encode(def.response, output));
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

/**
 * Bytes per body chunk. The writers yield many small pieces, and each write to the socket waits a turn of the event
 * loop, so pieces go out joined: the owner's all-dates reconciliation export took 1 s over HTTP piece by piece
 * against 0.2 s in process (N-PERF-REC).
 */
const BODY_CHUNK = 64 * 1024;

const encoder = new TextEncoder();

/** The source's next pieces joined until {@link BODY_CHUNK} bytes or its end; null once it is done. */
async function nextChunk(source: AsyncIterator<Uint8Array | string>): Promise<Uint8Array | null> {
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < BODY_CHUNK) {
    const next = await source.next();
    if (next.done) break;
    const part = typeof next.value === "string" ? encoder.encode(next.value) : next.value;
    parts.push(part);
    size += part.length;
  }
  if (parts.length <= 1) return parts[0] ?? null;
  const chunk = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    chunk.set(part, at);
    at += part.length;
  }
  return chunk;
}

/**
 * The chunks as a response body, each pulled only when the client reads (INV-99). A source error errors the body, so
 * the client sees a failed download rather than a short file; a client that goes away closes the source.
 */
function body(chunks: AsyncIterable<Uint8Array | string>): ReadableStream<Uint8Array> {
  const source = chunks[Symbol.asyncIterator]();
  return new ReadableStream(
    {
      async pull(controller) {
        const chunk = await nextChunk(source);
        if (chunk === null) controller.close();
        else controller.enqueue(chunk);
      },
      async cancel() {
        await source.return?.();
      },
    },
    // Nothing is read ahead of the client.
    { highWaterMark: 0 },
  );
}

/** Hono's media types plus the workbook's, which it lacks. */
const MEDIA_TYPES = { ...mimes, xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

/** A download named by `Content-Disposition` (D-0105), typed by its extension. */
function sendFile(c: Context, file: Download | StreamedFile): Response {
  const headers = {
    "content-type": getMimeType(file.fileName, MEDIA_TYPES) ?? "application/octet-stream",
    "content-disposition": contentDisposition(file.fileName),
  };
  if ("chunks" in file) return c.body(body(file.chunks), 200, headers);
  // `Response` takes only bytes backed by a plain ArrayBuffer; copy only a view of a shared one.
  const bytes = file.bytes.buffer instanceof ArrayBuffer ? (file.bytes as Uint8Array<ArrayBuffer>) : file.bytes.slice();
  return c.body(bytes, 200, headers);
}
