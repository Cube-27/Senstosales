// The whole app under test: the real route tree and query client on a memory history, with `fetch` answered by a
// fake API keyed `"<METHOD> <path>"`. Each answer is a body (200) or `{ status, body }`.
import { contentDisposition } from "@senstosales/schemas";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vite-plus/test";

import { createApp } from "../src/app.ts";

// jsdom has no scrolling (the router restores scroll positions) and no ResizeObserver (Radix measures controls).
window.scrollTo = () => {};
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

export interface Reply {
  readonly status: number;
  readonly body: unknown;
}
export type FakeApi = Record<string, unknown | ((body: unknown, url: URL) => unknown)>;

/** A download: the file's name (sent as `Content-Disposition`) and text. */
export interface FileReply {
  readonly fileName: string;
  readonly text: string;
}
export const fileReply = (fileName: string, text = "file"): FileReply => ({ fileName, text });
const isFile = (v: unknown): v is FileReply => typeof v === "object" && v !== null && "fileName" in v && "text" in v;

/** A reply other than 200. */
export const reply = (status: number, body: unknown): Reply => ({ status, body });
const isReply = (v: unknown): v is Reply =>
  typeof v === "object" && v !== null && "status" in v && "body" in v && Object.keys(v).length === 2;

/** Every request the app made, as `"<METHOD> <path>"` with its parsed JSON body. */
export interface Call {
  readonly route: string;
  readonly body: unknown;
  readonly url: URL;
}

export function stubApi(api: FakeApi): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string, init: { method: string; body?: string }) => {
    const url = new URL(input, "http://127.0.0.1");
    const route = `${init.method} ${url.pathname}`;
    const body: unknown = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ route, body, url });
    const handler = api[route];
    if (handler === undefined) throw new Error(`no fake for ${route}`);
    const answer = typeof handler === "function" ? handler(body, url) : handler;
    if (isFile(answer)) {
      const disposition = contentDisposition(answer.fileName);
      return {
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === "content-disposition" ? disposition : null) },
        arrayBuffer: async () => new TextEncoder().encode(answer.text).buffer,
      };
    }
    const { status, body: json } = isReply(answer) ? answer : { status: 200, body: answer };
    return { ok: status < 400, status, headers: { get: () => null }, json: async () => json };
  });
  return calls;
}

/** The fake API for a set-up install: onboarding done, signed in or not. */
export const signedIn = (authenticated: boolean, isDefaultPassword = false): FakeApi => ({
  "GET /api/onboarding": { required: false },
  "GET /api/auth/session": { authenticated, isDefaultPassword },
});

export function renderApp(path: string): RenderResult & ReturnType<typeof createApp> {
  const { queryClient, router } = createApp(createMemoryHistory({ initialEntries: [path] }));
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...view };
}
