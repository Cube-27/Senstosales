// The playwright-core Scraper (SPEC-19 §4.1): one headless Edge per session for the login, then a plain HTTP session on
// its cookies for listing and fetching. Steps follow the port's order (D-0376).
import type { BrowserType } from "playwright-core";

import { ScraperError, type Scraper, type ScraperSession } from "../../port.ts";
import { createHttpSession, type HttpSession } from "./http-session.ts";
import { launchEdge, USER_AGENT, type Edge } from "./launch.ts";
import { openLogin, submitLogin, submitOtp } from "./login.ts";
import { PO_DETAIL_URL, PO_LIST_URL, SRV_LIST_URL } from "./selectors.ts";

export { PORTAL_ORIGIN } from "./selectors.ts";

export type PlaywrightScraperOptions = {
  readonly browserType?: Pick<BrowserType, "launch">;
  /** The HTTP client for listing and fetching; tests pass one that never reaches the portal. */
  readonly fetch?: typeof fetch;
};

export function createPlaywrightScraper({
  browserType,
  fetch: fetchFn = fetch,
}: PlaywrightScraperOptions = {}): Scraper {
  return {
    async openSession() {
      return edgeSession(await launchEdge(browserType), fetchFn);
    },
  };
}

type Step =
  | { kind: "start" | "captcha" | "otp" | "closed" }
  /** Logged in; listing and fetching run over HTTP. */
  | { kind: "ready"; http: HttpSession }
  /** The portal went straight to the PO page after the captcha (EC-64): the OTP step only confirms it. */
  | { kind: "no-otp" };

function edgeSession({ browser, page }: Edge, fetchFn: typeof fetch): ScraperSession {
  // A portal alert or confirm would block the page until answered; accept it as a person would.
  page.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  let step: Step = { kind: "start" };

  function expect(...from: Step["kind"][]): void {
    if (step.kind === "closed") throw new ScraperError("closed");
    if (!from.includes(step.kind)) throw new ScraperError("out-of-order");
  }

  /** Runs a login step. A Playwright failure (timeout, navigation error, missing element) means the portal did not
   * answer as expected: `portal-unreachable`, its message never passed on (INV-81, INV-106). On any failure but a
   * wrong OTP the login starts over from a fresh captcha. */
  async function loginStep<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (step.kind === "closed") throw new ScraperError("closed");
      const error = err instanceof ScraperError ? err : new ScraperError("portal-unreachable");
      if (error.code !== "wrong-otp") step = { kind: "start" };
      throw error;
    }
  }

  /** Moves to `next` unless the session was closed while the step ran. */
  function advance(next: Step): void {
    if (step.kind === "closed") throw new ScraperError("closed");
    step = next;
  }

  /** Hands the login cookies (the ones the portal would send to the pages fetched next) to an HTTP session and
   * closes Edge, which the HTTP session does not need. */
  async function loggedIn(): Promise<void> {
    const cookies = await loginStep(() => page.context().cookies([PO_LIST_URL, PO_DETAIL_URL, SRV_LIST_URL]));
    advance({ kind: "ready", http: createHttpSession(cookies, USER_AGENT, fetchFn) });
    await browser.close().catch(() => {});
  }

  function http(): HttpSession {
    if (step.kind === "ready") return step.http;
    throw new ScraperError(step.kind === "closed" ? "closed" : "out-of-order");
  }

  return {
    async prepareLogin() {
      expect("start", "captcha");
      const png = await loginStep(() => openLogin(page));
      advance({ kind: "captcha" });
      return png;
    },
    async submitCaptcha(supplierCode, password, captcha) {
      expect("captcha");
      const at = await loginStep(() => submitLogin(page, { supplierCode, password, captcha }));
      advance({ kind: at === "otp" ? "otp" : "no-otp" });
    },
    async submitOtp(otp) {
      expect("otp", "no-otp");
      if (step.kind === "otp") await loginStep(() => submitOtp(page, otp));
      await loggedIn();
    },
    async listPoIds() {
      return http().listPoIds();
    },
    async fetchPoHtml(poId) {
      return http().fetchPoHtml(poId);
    },
    async fetchSrvHtml(poId) {
      return http().fetchSrvHtml(poId);
    },
    async close() {
      if (step.kind === "closed") return;
      step = { kind: "closed" };
      await browser.close().catch(() => {});
    },
  };
}
