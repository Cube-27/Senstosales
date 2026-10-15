// The adapter end to end in a real headless Edge (INV-86). Every browser request is answered by a route serving the
// synthetic fixtures, and listing/fetching go to the test's fetch, so nothing reaches the network or the portal. The
// stub never answers with a redirect: Playwright does not route the request a redirect leads to. As a backstop, the
// test browser's proxy is a closed local port, so any request a route does not answer fails without leaving the
// machine.
import { chromium, type Browser, type BrowserContext, type BrowserType, type Route } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import type { ScraperSession } from "../../src/port.ts";
import { createPlaywrightScraper } from "../../src/platform/playwright/index.ts";
import { PORTAL_ORIGIN } from "../../src/platform/playwright/selectors.ts";
import { codeOf } from "../code-of.ts";
import { LOGIN_HTML, OTP_HTML, OTP_INVALID_HTML, PO_LIST_HTML } from "./fixtures.ts";

const LOGIN = { supplierCode: "SUP001", password: "synthetic-pass", captcha: "4821" };
const OTP = "123456";
// A 1x1 PNG for the captcha digit images.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type PortalOptions = { skipOtp?: boolean; down?: boolean };

/** The synthetic portal: login (with notices), OTP, then the supplier PO page; anything else is aborted. */
function portal(options: PortalOptions, offPortal: string[]) {
  return async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const form = new URLSearchParams(request.postData() ?? "");
    const html = (body: string, headers: Record<string, string> = {}) =>
      route.fulfill({ contentType: "text/html", body, headers });
    if (url.origin !== PORTAL_ORIGIN || options.down) {
      if (url.origin !== PORTAL_ORIGIN) offPortal.push(url.href);
      return route.abort();
    }
    switch (url.pathname) {
      case "/mm/":
        return html(LOGIN_HTML);
      case "/mm/captcha.asp":
        return route.fulfill({ contentType: "image/png", body: PIXEL });
      case "/mm/login_check.asp": {
        const ok =
          form.get("supp_code") === LOGIN.supplierCode &&
          form.get("b2b_passwd") === LOGIN.password &&
          form.get("c") === LOGIN.captcha;
        if (!ok) return html(LOGIN_HTML);
        const cookie = { "set-cookie": "ASPSESSIONIDAB=synthetic-session; path=/" };
        return html(options.skipOtp ? PO_LIST_HTML : OTP_HTML, cookie);
      }
      case "/mm/otp_check.asp":
        return html(form.get("txtOTP") === OTP ? PO_LIST_HTML : OTP_INVALID_HTML);
      case "/mm/suppliers_po_page.asp":
        return html(PO_LIST_HTML);
      default:
        return route.fulfill({ status: 404 });
    }
  };
}

/** No proxy listens here: a request that no route answers fails on this machine. */
const DEAD_PROXY = { server: "http://127.0.0.1:9" };

type Harness = { session: ScraperSession; fetched: Array<{ url: string; cookie: string | null }>; offPortal: string[] };

// One headless Edge behind the dead proxy for the whole file; each session gets its own context, so cookies and
// routes never mix between tests.
let edge: Browser | undefined;
beforeAll(async () => {
  edge = await chromium.launch({ channel: "msedge", headless: true, proxy: DEAD_PROXY });
});
afterAll(async () => {
  await edge?.close();
});

const open: ScraperSession[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

function sharedEdge(): Browser {
  if (!edge) throw new Error("Edge was not launched");
  return edge;
}

/** A browser type whose "browser" is one routed context of the shared Edge; closing it closes that context. */
function routedBrowserType(options: PortalOptions, offPortal: string[]): Pick<BrowserType, "launch"> {
  return {
    async launch() {
      let context: BrowserContext | undefined;
      const browser: Pick<Browser, "newContext" | "close"> = {
        async newContext(contextOptions) {
          context = await sharedEdge().newContext(contextOptions);
          await context.route("**/*", portal(options, offPortal));
          return context;
        },
        async close() {
          await context?.close();
        },
      };
      return browser as Browser;
    },
  };
}

/** A logged-out session on the synthetic portal; listing and fetching go to a fetch that records each request. */
async function harness(options: PortalOptions = {}): Promise<Harness> {
  const offPortal: string[] = [];
  const fetched: Harness["fetched"] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    fetched.push({ url: String(input), cookie: new Headers(init?.headers).get("cookie") });
    return new Response(PO_LIST_HTML);
  };
  const browserType = routedBrowserType(options, offPortal);
  const session = await createPlaywrightScraper({ browserType, fetch: fakeFetch }).openSession();
  open.push(session);
  return { session, fetched, offPortal };
}

const submitLogin = (session: ScraperSession, captcha = LOGIN.captcha) =>
  session.submitCaptcha(LOGIN.supplierCode, LOGIN.password, captcha);

describe("Playwright adapter in headless Edge", { timeout: 60_000 }, () => {
  it("the test browser cannot reach the network: an unrouted request fails at the dead proxy", async () => {
    const page = await sharedEdge().newPage();
    try {
      const error: unknown = await page.goto("http://unrouted.example.test/").catch((e: unknown) => e);
      expect(String(error)).toContain("ERR_PROXY_CONNECTION_FAILED");
    } finally {
      await page.context().close();
    }
  });

  it("dismisses the notices, shoots the captcha, logs in through the OTP and lists over HTTP with its cookies", async () => {
    const { session, fetched, offPortal } = await harness();
    const png = await session.prepareLogin();
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    await submitLogin(session);
    await session.submitOtp(OTP);
    expect(await session.listPoIds()).toEqual(["1000000001", "1000000002"]);
    expect(fetched).toEqual([
      { url: "https://bpl.bhel.com/mm/suppliers_po_page.asp", cookie: "ASPSESSIONIDAB=synthetic-session" },
    ]);
    expect(offPortal).toEqual([]);
  });

  it("a wrong captcha needs a fresh captcha; then the login goes on", async () => {
    const { session } = await harness();
    await session.prepareLogin();
    expect(await codeOf(submitLogin(session, "0000"))).toBe("wrong-captcha");
    expect(await codeOf(submitLogin(session))).toBe("out-of-order");
    await session.prepareLogin();
    await submitLogin(session);
    await session.submitOtp(OTP);
    expect(await session.listPoIds()).toEqual(["1000000001", "1000000002"]);
  });

  it("a wrong OTP is retried in place", async () => {
    const { session } = await harness();
    await session.prepareLogin();
    await submitLogin(session);
    expect(await codeOf(session.submitOtp("999999"))).toBe("wrong-otp");
    await session.submitOtp(OTP);
    expect(await session.listPoIds()).toEqual(["1000000001", "1000000002"]);
  });

  it("when the portal skips the OTP step, the OTP step only confirms the login (EC-64)", async () => {
    const { session, fetched } = await harness({ skipOtp: true });
    await session.prepareLogin();
    await submitLogin(session);
    await session.submitOtp("ignored");
    expect(await session.listPoIds()).toEqual(["1000000001", "1000000002"]);
    expect(fetched.map(({ cookie }) => cookie)).toEqual(["ASPSESSIONIDAB=synthetic-session"]);
  });

  it("answers portal-unreachable when the portal does not load", async () => {
    const { session } = await harness({ down: true });
    expect(await codeOf(session.prepareLogin())).toBe("portal-unreachable");
  });
});
