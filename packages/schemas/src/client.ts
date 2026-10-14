// The web client over the route table (SPEC-04 §4.1): no code generation, every call typed by its table entry.
// Values cross as the domain's types (`Qty`, `Money`, …); the client encodes bodies and decodes responses through the
// same codecs the API uses, so the wire format stays in one place (C3).
import { z } from "zod";

import { type ErrorBody, zErrorBody } from "./api/common.ts";
import { type PathParams, type RouteDef, routes } from "./routes.ts";

export type RouteName = keyof typeof routes;
type Def<N extends RouteName> = (typeof routes)[N];

/**
 * What a call takes: the path's ids, an optional decoded query (defaults filled by the API) and the decoded body.
 */
export type RouteInput<N extends RouteName> = ([PathParams<Def<N>["path"]>] extends [never]
  ? unknown
  : { params: Record<PathParams<Def<N>["path"]>, string> }) &
  (Def<N> extends { query: infer Q extends z.ZodType } ? { query?: Partial<z.output<Q>> } : unknown) &
  (Def<N> extends { body: infer B extends z.ZodType } ? { body: z.output<B> } : unknown);

/** A downloaded file: its `Content-Disposition` name and its bytes. */
export interface Download {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** What a call returns, decoded. */
export type RouteOutput<N extends RouteName> = Def<N>["response"] extends z.ZodType
  ? z.output<Def<N>["response"]>
  : Download;

/** The part of `Response` the client reads, so the package needs no DOM types. */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

/** A non-2xx answer, with the API's error body (`{ code, message, details? }`). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
    this.name = "ApiError";
  }
}

type Args<N extends RouteName> = object extends RouteInput<N> ? [input?: RouteInput<N>] : [input: RouteInput<N>];

export function createClient(fetchImpl: FetchLike) {
  return {
    async request<N extends RouteName>(name: N, ...[input]: Args<N>): Promise<RouteOutput<N>> {
      const def: RouteDef = routes[name];
      const { params, query, body } = (input ?? {}) as {
        params?: object;
        query?: Record<string, unknown>;
        body?: unknown;
      };
      const accept = def.response === "file" ? "*/*" : "application/json";
      const init: Parameters<FetchLike>[1] = { method: def.method, headers: { accept } };
      // Every mutation is JSON (INV-102), even one with nothing to send.
      if (def.method !== "GET") {
        init.headers["content-type"] = "application/json";
        init.body = JSON.stringify(def.body ? z.encode(def.body, body) : {});
      }
      const wireQuery = def.query && query ? z.encode(partial(def.query), query) : {};
      const res = await fetchImpl(buildUrl(def.path, params, wireQuery), init);
      if (!res.ok) throw new ApiError(res.status, await errorBody(res));
      if (def.response === "file") {
        const download: Download = { fileName: fileName(res), bytes: new Uint8Array(await res.arrayBuffer()) };
        return download as RouteOutput<N>;
      }
      return z.decode(def.response, await res.json()) as RouteOutput<N>;
    },
  };
}

// A caller sends only the filters it sets, so its query is encoded through the partial schema; built once per route.
const partials = new WeakMap<z.ZodObject, z.ZodObject>();

function partial(query: z.ZodObject): z.ZodObject {
  let schema = partials.get(query);
  if (!schema) partials.set(query, (schema = query.partial()));
  return schema;
}

function buildUrl(path: string, params: object = {}, query: object = {}): string {
  const values = params as Record<string, string>;
  const url = path.replace(/:(\w+)/g, (_, key: string) => encodeURIComponent(String(values[key])));
  // An array is a repeated key (`types=po&types=dc`).
  const pairs = Object.entries(query).flatMap(([key, value]: [string, unknown]) =>
    [value]
      .flat()
      .filter((v) => v !== undefined)
      .map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`),
  );
  return pairs.length > 0 ? `${url}?${pairs.join("&")}` : url;
}

async function errorBody(res: FetchResponse): Promise<ErrorBody> {
  const parsed = zErrorBody.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : { code: `http-${res.status}`, message: "Something went wrong. Try again." };
}

/** The `Content-Disposition` of a download named `fileName` (RFC 5987), as `fileName` below reads it back. */
export function contentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16)}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}

/** The download name from `Content-Disposition` (legacy names such as `DC_<n>.xlsx`, SPEC-12). */
function fileName(res: FetchResponse): string {
  const header = res.headers.get("content-disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(header);
  return match ? decodeURIComponent(match[1] ?? match[2] ?? "") : "download";
}
