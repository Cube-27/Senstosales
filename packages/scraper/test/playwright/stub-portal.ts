// A stub of the portal's pages on 127.0.0.1, and a fetch that sends portal URLs to it. The fetch refuses any URL
// outside the portal origin, so a test can never reach the network.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { PORTAL_ORIGIN } from "../../src/platform/playwright/selectors.ts";

export type StubRequest = { method: string; path: string; headers: IncomingMessage["headers"]; body: string };
export type StubReply = { status?: number; headers?: Record<string, string>; body?: string };

export type StubPortal = {
  readonly requests: StubRequest[];
  readonly fetch: typeof fetch;
  close(): Promise<void>;
};

export async function startStubPortal(reply: (request: StubRequest) => StubReply): Promise<StubPortal> {
  const requests: StubRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => {
      const request = { method: req.method ?? "", path: req.url ?? "", headers: req.headers, body };
      requests.push(request);
      const { status = 200, headers = {}, body: out = "" } = reply(request);
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers }).end(out);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const stubFetch: typeof fetch = (input, init) => {
    const url = String(input);
    if (!url.startsWith(`${PORTAL_ORIGIN}/`)) throw new Error(`not a portal URL: ${url}`);
    return fetch(local + url.slice(PORTAL_ORIGIN.length), init);
  };
  return {
    requests,
    fetch: stubFetch,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
