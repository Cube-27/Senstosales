// The scripted fake Scraper (SPEC-19 §4.1) for API and e2e tests: a fixed captcha and OTP, PO ids, and pages given by
// the test. It runs under the same step guard as the real adapter, so callers are tested against the port's order.
import { ScraperError, type Scraper } from "./port.ts";
import { guardedSession, type PortalDriver } from "./session-guard.ts";

export type FakeScript = {
  captchaPng: Uint8Array;
  /** The captcha text that `submitCaptcha` accepts. */
  captcha: string;
  /** The OTP that `submitOtp` accepts. */
  otp: string;
  /** Pages by PO id; an id with no page fails its fetch with `fetch-failed`. */
  poPages: Record<string, string>;
  srvPages: Record<string, string>;
  /** The ids the portal lists; defaults to the ids of `poPages`. */
  poIds?: string[];
  /** Makes `openSession` reject, as when Edge is missing or the portal is down. */
  failOpen?: "edge-unavailable" | "portal-unreachable";
};

export function createFakeScraper(script: FakeScript): Scraper {
  return {
    async openSession() {
      if (script.failOpen) throw new ScraperError(script.failOpen);
      return guardedSession(fakeDriver(script));
    },
  };
}

function fakeDriver(script: FakeScript): PortalDriver {
  async function page(pages: Record<string, string>, poId: string): Promise<string> {
    const html = pages[poId];
    if (html === undefined) throw new ScraperError("fetch-failed");
    return html;
  }

  return {
    async openLogin() {
      return script.captchaPng;
    },
    async submitLogin({ captcha }) {
      if (captcha !== script.captcha) throw new ScraperError("wrong-captcha");
      return "otp";
    },
    async submitOtp(otp) {
      if (otp !== script.otp) throw new ScraperError("wrong-otp");
    },
    async loggedIn() {
      return {
        listPoIds: async () => script.poIds ?? Object.keys(script.poPages),
        fetchPoHtml: (poId) => page(script.poPages, poId),
        fetchSrvHtml: (poId) => page(script.srvPages, poId),
      };
    },
    async close() {},
  };
}
