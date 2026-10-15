// The scripted fake Scraper (SPEC-19 §4.1) for API and e2e tests: a fixed captcha and OTP, PO ids, and pages given by
// the test. It enforces the port's step order so callers are tested against it.
import { assertPoId, isPoId, ScraperError, type Scraper, type ScraperSession } from "./port.ts";

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

type Step = "start" | "captcha" | "otp" | "ready" | "closed";

export function createFakeScraper(script: FakeScript): Scraper {
  return {
    async openSession() {
      if (script.failOpen) throw new ScraperError(script.failOpen);
      return fakeSession(script);
    },
  };
}

function fakeSession(script: FakeScript): ScraperSession {
  let step: Step = "start";

  /** Refuses the call unless the session is at one of `from`. */
  function expectStep(...from: Step[]): void {
    if (step === "closed") throw new ScraperError("closed");
    if (!from.includes(step)) throw new ScraperError("out-of-order");
  }

  function fetchPage(pages: Record<string, string>, poId: string): string {
    expectStep("ready");
    assertPoId(poId);
    const page = pages[poId];
    if (page === undefined) throw new ScraperError("fetch-failed");
    return page;
  }

  return {
    async prepareLogin() {
      expectStep("start", "captcha");
      step = "captcha";
      return script.captchaPng;
    },
    async submitCaptcha(_supplierCode, _password, captcha) {
      expectStep("captcha");
      // The portal shows a new captcha after a wrong one, so the next try starts from `prepareLogin`.
      if (captcha !== script.captcha) {
        step = "start";
        throw new ScraperError("wrong-captcha");
      }
      step = "otp";
    },
    async submitOtp(otp) {
      expectStep("otp");
      if (otp !== script.otp) throw new ScraperError("wrong-otp");
      step = "ready";
    },
    async listPoIds() {
      expectStep("ready");
      return (script.poIds ?? Object.keys(script.poPages)).filter(isPoId);
    },
    async fetchPoHtml(poId) {
      return fetchPage(script.poPages, poId);
    },
    async fetchSrvHtml(poId) {
      return fetchPage(script.srvPages, poId);
    },
    async close() {
      step = "closed";
    },
  };
}
