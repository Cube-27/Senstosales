import { afterEach, describe, expect, it } from "vite-plus/test";

import { ScraperError } from "../../src/port.ts";
import { createHttpSession } from "../../src/platform/playwright/http-session.ts";
import { PO_LIST_HTML } from "./fixtures.ts";
import { startStubPortal, type StubPortal, type StubReply, type StubRequest } from "./stub-portal.ts";

const COOKIES = [
  { name: "ASPSESSIONIDAB", value: "synthetic-session" },
  { name: "portal_token", value: "t-1" },
];
const UA = "SyntheticAgent/1.0";

let portal: StubPortal | undefined;
afterEach(async () => {
  await portal?.close();
  portal = undefined;
});

/** The portal's answer by path: the PO list, a PO page and an SRV page echoing the posted id. */
function portalPages({ method, path, body }: StubRequest): StubReply {
  const pono = new URLSearchParams(body).get("pono");
  if (method === "GET" && path === "/mm/suppliers_po_page.asp") return { body: PO_LIST_HTML };
  if (method === "POST" && path === "/mm/podtls.asp") return { body: `<html>PO ${pono} – ₹</html>` };
  if (method === "POST" && path === "/mm/listsrv.asp") return { body: `<html>SRV ${pono}</html>` };
  return { status: 404 };
}

async function session(reply: (request: StubRequest) => StubReply = portalPages) {
  portal = await startStubPortal(reply);
  return { http: createHttpSession(COOKIES, UA, portal.fetch), requests: portal.requests };
}

async function codeOf(call: Promise<unknown>): Promise<string> {
  const error: unknown = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof ScraperError ? error.code : `not a ScraperError: ${String(error)}`;
}

/** The parts of a request the portal sees that matter here. */
const seen = ({ method, path, headers, body }: StubRequest) => ({
  method,
  path,
  cookie: headers["cookie"],
  ua: headers["user-agent"],
  referer: headers["referer"],
  origin: headers["origin"],
  type: headers["content-type"],
  body,
});

describe("HTTP session on the login cookies", () => {
  it("lists PO ids from the supplier PO page with the login cookies", async () => {
    const { http, requests } = await session();
    expect(await http.listPoIds()).toEqual(["1000000001", "1000000002"]);
    expect(requests.map(seen)).toEqual([
      {
        method: "GET",
        path: "/mm/suppliers_po_page.asp",
        cookie: "ASPSESSIONIDAB=synthetic-session; portal_token=t-1",
        ua: UA,
        referer: "https://bpl.bhel.com/mm/suppliers_po_page.asp",
        origin: undefined,
        type: undefined,
        body: "",
      },
    ]);
  });

  it("posts the PO id to the PO page and returns the page as a string", async () => {
    const { http, requests } = await session();
    expect(await http.fetchPoHtml("1000000002")).toBe("<html>PO 1000000002 – ₹</html>");
    expect(requests.map(seen)).toEqual([
      {
        method: "POST",
        path: "/mm/podtls.asp",
        cookie: "ASPSESSIONIDAB=synthetic-session; portal_token=t-1",
        ua: UA,
        referer: "https://bpl.bhel.com/mm/suppliers_po_page.asp",
        origin: "https://bpl.bhel.com",
        type: "application/x-www-form-urlencoded",
        body: "pono=1000000002",
      },
    ]);
  });

  it("opens the PO page before the SRV list, as the portal needs", async () => {
    const { http, requests } = await session();
    expect(await http.fetchSrvHtml("1000000001")).toBe("<html>SRV 1000000001</html>");
    expect(requests.map(({ path, body, headers }) => [path, body, headers["referer"]])).toEqual([
      ["/mm/podtls.asp", "pono=1000000001", "https://bpl.bhel.com/mm/suppliers_po_page.asp"],
      ["/mm/listsrv.asp", "pono=1000000001", "https://bpl.bhel.com/mm/podtls.asp"],
    ]);
  });

  it("rejects an invalid PO id before any request (INV-97)", async () => {
    const { http, requests } = await session();
    for (const id of ["", "12AB", "12345678901", "1&pono=2", "../x"]) {
      expect(await codeOf(http.fetchPoHtml(id))).toBe("invalid-po-id");
      expect(await codeOf(http.fetchSrvHtml(id))).toBe("invalid-po-id");
    }
    expect(requests).toEqual([]);
  });

  it("answers fetch-failed for an error status, with no page detail", async () => {
    const { http } = await session(() => ({ status: 500, body: "<html>secret page body</html>" }));
    const error: unknown = await http.fetchPoHtml("1000000001").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScraperError);
    expect((error as ScraperError).message).toBe("A page could not be fetched from the BHEL portal.");
  });

  it("never follows a redirect (C17)", async () => {
    const { http, requests } = await session(({ path }) =>
      path === "/mm/podtls.asp" ? { status: 302, headers: { location: "/mm/elsewhere.asp" } } : { body: "followed" },
    );
    expect(await codeOf(http.fetchPoHtml("1000000001"))).toBe("fetch-failed");
    expect(requests.map(({ path }) => path)).toEqual(["/mm/podtls.asp"]);
  });

  it("stops at the warm-up when the PO page fails, without asking for the SRV list", async () => {
    const { http, requests } = await session(({ path }) => (path === "/mm/podtls.asp" ? { status: 500 } : {}));
    expect(await codeOf(http.fetchSrvHtml("1000000001"))).toBe("fetch-failed");
    expect(requests.map(({ path }) => path)).toEqual(["/mm/podtls.asp"]);
  });
});
