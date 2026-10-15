// The playwright-core Scraper (SPEC-19 §4.1): one headless Edge per session for the login, then a plain HTTP session on
// its cookies for listing and fetching. The step order is the shared guard's (session-guard.ts).
import type { BrowserType } from "playwright-core";

import type { Scraper } from "../../port.ts";
import { guardedSession, type PortalDriver } from "../../session-guard.ts";
import { createHttpSession } from "./http-session.ts";
import { launchEdge, type Edge } from "./launch.ts";
import { openLogin, submitLogin, submitOtp } from "./login.ts";
import { PO_DETAIL_URL, PO_LIST_URL, SRV_LIST_URL } from "./selectors.ts";

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
      return guardedSession(edgeDriver(await launchEdge(browserType), fetchFn));
    },
  };
}

function edgeDriver({ browser, page }: Edge, fetchFn: typeof fetch): PortalDriver {
  // A portal alert or confirm would block the page until answered; accept it as a person would.
  page.on("dialog", (dialog) => {
    dialog.accept().catch(() => {});
  });
  const closeEdge = () => browser.close().catch(() => {});
  return {
    openLogin: () => openLogin(page),
    submitLogin: (login) => submitLogin(page, login),
    submitOtp: (otp) => submitOtp(page, otp),
    /** Hands the login cookies (the ones the portal would send to the pages fetched next) to an HTTP session and
     * closes Edge, which the HTTP session does not need. */
    async loggedIn() {
      const cookies = await page.context().cookies([PO_LIST_URL, PO_DETAIL_URL, SRV_LIST_URL]);
      await closeEdge();
      return createHttpSession(cookies, fetchFn);
    },
    close: closeEdge,
  };
}
