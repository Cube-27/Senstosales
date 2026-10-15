// The request stub of the PO and SRV screen tests, over the shared app harness (`app.tsx`): each request goes to a
// handler keyed `"<METHOD> <path>"` that sees the method, path, query and body; an unhandled request fails the test.
// The install is set up and signed in, so the session gate opens every screen.
import { contentDisposition } from "@senstosales/schemas";
import { configure } from "@testing-library/react";
import { vi } from "vite-plus/test";

export { renderApp } from "./app.tsx";

// The first screen of a file waits for its route chunk to load; later ones are quick.
configure({ asyncUtilTimeout: 5000 });

/** One request the app made: method, path, query and decoded JSON body. */
export interface Call {
  readonly method: string;
  readonly path: string;
  readonly query: Record<string, string>;
  readonly body: unknown;
}

type Handler = (call: Call) => unknown;

/** An answer other than 200, with the API's error body. */
export const fail = (status: number, code: string, message: string) => ({ __status: status, body: { code, message } });

/** A download: `text` as the file's bytes, named `name` by `Content-Disposition`. */
export const file = (name: string, text = "synthetic file") => ({ __file: name, text });

const SIGNED_IN: Record<string, Handler> = {
  "GET /api/onboarding": () => ({ required: false }),
  "GET /api/auth/session": () => ({ authenticated: true, isDefaultPassword: false }),
};

/** Stubs `fetch` with `handlers`; returns every call to them, in order (the session gate's own reads left out). */
export function stubApi(handlers: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init: { method: string; body?: string }) => {
    const parsed = new URL(url, "http://127.0.0.1");
    const call: Call = {
      method: init.method,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    const key = `${call.method} ${call.path}`;
    const handler = handlers[key] ?? SIGNED_IN[key];
    if (!handler) return Promise.reject(new Error(`unexpected request ${key}`));
    if (handlers[key]) calls.push(call);
    const answer = handler(call);
    if (typeof answer === "object" && answer !== null && "__file" in answer) {
      const headers = { "content-disposition": contentDisposition(String(Reflect.get(answer, "__file"))) };
      return Promise.resolve(new Response(String(Reflect.get(answer, "text")), { status: 200, headers }));
    }
    const failed = typeof answer === "object" && answer !== null && "__status" in answer;
    const [status, body] = failed
      ? [Number(Reflect.get(answer, "__status")), Reflect.get(answer, "body")]
      : [200, answer];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  return calls;
}
