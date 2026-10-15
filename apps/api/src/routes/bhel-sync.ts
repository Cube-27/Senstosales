// The BHEL login wizard (SPEC-19 §2): open a session and show its captcha, take the captcha, then the OTP; the scrape
// itself starts through `jobs.start` with the session id.
import type { Handlers } from "../app.ts";
import type { BhelWizardService } from "../services/bhel-sync.ts";

export function bhelSyncRoutes(bhel: BhelWizardService) {
  return {
    "bhel.start": () => bhel.start(),
    "bhel.captcha": ({ params, body }) => bhel.captcha(params.sessionId, body.captcha),
    "bhel.otp": ({ params, body }) => bhel.otp(params.sessionId, body.otp),
    "bhel.close": ({ params }) => bhel.close(params.sessionId),
  } satisfies Handlers;
}
