// SPEC-07 PR 1: the Host guard (C10, INV-79), JSON-only mutations (INV-102) and the body cap (INV-110).
import { describe, expect, it } from "vite-plus/test";

import { HOST, json, PORT, testApp } from "./helpers.ts";

const ok = { ok: true } as const;

describe("Host guard (C10, INV-79)", () => {
  const { send } = testApp({ "buyers.list": () => [] });

  it.each([`127.0.0.1:${PORT}`, `localhost:${PORT}`])("answers Host %s", async (host) => {
    const res = await send("/api/buyers", { headers: { host } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it.each([
    "example.com",
    `example.com:${PORT}`,
    `localhost.example.com:${PORT}`,
    `192.168.1.5:${PORT}`,
    `127.0.0.1:${PORT + 1}`,
    "127.0.0.1",
    "localhost",
    `[::1]:${PORT}`,
  ])("refuses Host %s with 400", async (host) => {
    const res = await send("/api/buyers", { headers: { host } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad-host", message: "This address is not allowed." });
  });

  it("refuses a request with no Host header", async () => {
    const { app } = testApp();
    const res = await app.request(new Request(`http://${HOST}/api/buyers`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad-host", message: "This address is not allowed." });
  });

  it("refuses before routing, so an unknown path is a 400 too", async () => {
    const res = await send("/api/nothing-here", { headers: { host: "example.com" } });
    expect(res.status).toBe(400);
  });
});

describe("JSON-only mutations (INV-102)", () => {
  const { send } = testApp({ "auth.logout": () => ok, "buyers.delete": () => ok });
  const ID = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";
  const notJson = { code: "json-only", message: "The request must be sent as JSON." };

  it("refuses a text/plain POST with 415", async () => {
    const res = await send("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual(notJson);
  });

  it("refuses a form POST and a POST with no content type", async () => {
    const form = await send("/api/auth/logout", { method: "POST", body: new URLSearchParams({ a: "1" }) });
    const bare = await send("/api/auth/logout", { method: "POST" });
    expect([form.status, bare.status]).toEqual([415, 415]);
  });

  it("refuses a DELETE that is not JSON", async () => {
    const res = await send(`/api/buyers/${ID}`, { method: "DELETE" });
    expect(res.status).toBe(415);
  });

  it("accepts JSON, with or without a charset", async () => {
    const plain = await send("/api/auth/logout", json("POST", {}));
    const charset = await send("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: "{}",
    });
    expect([plain.status, charset.status]).toEqual([200, 200]);
    expect(await plain.json()).toEqual(ok);
  });

  it("refuses a look-alike type", async () => {
    const res = await send("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/jsonx" },
      body: "{}",
    });
    expect(res.status).toBe(415);
  });
});

describe("Body cap (INV-110)", () => {
  const MB = 1024 * 1024;
  const received: number[] = [];
  const { send } = testApp({
    "po.upload": ({ body }) => {
      received.push(body.files[0]?.html.length ?? 0);
      return { results: [] };
    },
  });
  const prefix = '{"files":[{"name":"a.html","html":"';
  const suffix = '"}]}';
  /** An upload body of exactly `bytes` bytes. */
  const uploadOf = (bytes: number) => prefix + "x".repeat(bytes - prefix.length - suffix.length) + suffix;

  it("accepts a body of exactly 10 MB", async () => {
    const res = await send("/api/po/upload", json("POST", JSON.parse(uploadOf(10 * MB))));
    expect(res.status).toBe(200);
    expect(received.at(-1)).toBe(10 * MB - prefix.length - suffix.length);
  });

  it("refuses an 11 MB body with 413 before the handler runs", async () => {
    const before = received.length;
    const res = await send("/api/po/upload", json("POST", JSON.parse(uploadOf(11 * MB))));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ code: "too-large", message: "The file is too large. The limit is 10 MB." });
    expect(received.length).toBe(before);
  });

  it("refuses a streamed body with no Content-Length once it passes 10 MB", async () => {
    const chunk = new TextEncoder().encode("x".repeat(MB));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 11) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const res = await send("/api/po/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
  });
});
