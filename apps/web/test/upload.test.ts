import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MAX_BODY_BYTES } from "@senstosales/schemas";

import { stageFolder, TOO_LARGE, uploadHtml } from "../src/lib/upload.ts";

afterEach(() => vi.unstubAllGlobals());

type Sent = { url: string; body: unknown };

/** Stubs `fetch` with `answer` per request and records each request's URL and decoded body. */
function stubFetch(answer: (body: unknown, n: number) => unknown): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (url: string, init: { body: string }) => {
    const body: unknown = JSON.parse(init.body);
    sent.push({ url, body });
    return Promise.resolve(new Response(JSON.stringify(answer(body, sent.length))));
  });
  return sent;
}

const page = (name: string, html = "<html></html>") => new File([html], name, { type: "text/html" });
const ULID_A = "01J00000000000000000000001";

describe("uploadHtml (D-0131)", () => {
  it("sends the file as JSON and answers the API's outcome for it", async () => {
    const sent = stubFetch(() => ({ results: [{ name: "a.html", status: "skipped", reason: "An older PO page." }] }));
    expect(await uploadHtml("po.upload", page("a.html", "<p>po</p>"))).toEqual({
      status: "skipped",
      reason: "An older PO page.",
    });
    expect(sent).toEqual([{ url: "/api/po/upload", body: { files: [{ name: "a.html", html: "<p>po</p>" }] } }]);
  });

  it("never sends a file over the 10 MB body cap", async () => {
    const sent = stubFetch(() => ({ results: [] }));
    const big = page("big.html", "x".repeat(10 * 1024 * 1024));
    expect(await uploadHtml("srv.upload", big)).toEqual({ status: "failed", reason: TOO_LARGE });
    expect(sent).toEqual([]);
  });
});

describe("stageFolder", () => {
  it("opens one staging area and adds every later request to it", async () => {
    const files = Array.from({ length: 60 }, (_, i) => page(`po-${i}.html`));
    const sent = stubFetch((_, n) => ({ stagingId: ULID_A, count: n }));
    expect(await stageFolder("po", files)).toEqual({ stagingId: ULID_A, tooLarge: [] });
    // 50 files are read per round: two requests, the second naming the area the first opened.
    const bodies = sent.map((s) => s.body as { kind: string; stagingId?: string; files: { name: string }[] });
    expect(bodies.map((b) => [b.kind, b.stagingId, b.files.length])).toEqual([
      ["po", undefined, 50],
      ["po", ULID_A, 10],
    ]);
    expect(bodies.flatMap((b) => b.files.map((f) => f.name))).toEqual(files.map((f) => f.name));
  });

  it("keeps every staging body, kind and staging id included, within the 10 MB cap", async () => {
    // Together the two files fill a {"files":[…]} body to 4 bytes under the cap: packed into one request, kind and
    // stagingId would take it over.
    const half =
      (MAX_BODY_BYTES - '{"files":[{"name":"a.html","html":""},{"name":"bb.html","html":""}]}'.length - 4) / 2;
    const files = [page("a.html", "x".repeat(half)), page("bb.html", "x".repeat(half))];
    const sent: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init: { body: string }) => {
      sent.push(init.body);
      return Promise.resolve(new Response(JSON.stringify({ stagingId: ULID_A, count: 1 })));
    });
    expect(await stageFolder("srv", files)).toEqual({ stagingId: ULID_A, tooLarge: [] });
    expect(sent.map((body) => new TextEncoder().encode(body).length <= MAX_BODY_BYTES)).toEqual([true, true]);
  });

  it("leaves out a file over the cap and stages the rest", async () => {
    const sent = stubFetch(() => ({ stagingId: ULID_A, count: 1 }));
    const result = await stageFolder("srv", [page("big.html", "x".repeat(10 * 1024 * 1024)), page("ok.html")]);
    expect(result).toEqual({ stagingId: ULID_A, tooLarge: ["big.html"] });
    expect(sent.map((s) => s.url)).toEqual(["/api/jobs/staging"]);
  });

  it("has no staging area when nothing could be sent", async () => {
    const sent = stubFetch(() => ({}));
    expect(await stageFolder("po", [])).toEqual({ stagingId: null, tooLarge: [] });
    expect(sent).toEqual([]);
  });
});
