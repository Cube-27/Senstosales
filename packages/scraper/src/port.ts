// The Scraper port (ARCHITECTURE §4.1, SPEC-19 §4.1): one BHEL portal session per sync, logged in through captcha and
// e-mailed OTP, then listing PO ids and fetching PO and SRV pages. Page content is data, never executed (C17).
import { zPoId } from "@senstosales/schemas";

export interface Scraper {
  /** Starts a browser session on the portal. Rejects with `edge-unavailable` or `portal-unreachable`. */
  openSession(): Promise<ScraperSession>;
}

/**
 * Steps run in order: `prepareLogin` -> `submitCaptcha` -> `submitOtp` -> listing and fetching. A call out of order
 * rejects with `out-of-order`; any call after `close` rejects with `closed`.
 */
export interface ScraperSession {
  /** The captcha image as PNG bytes. Called again after a wrong captcha for a fresh one. */
  prepareLogin(): Promise<Uint8Array>;
  /** Logs in with the supplier code, the stored password and the captcha the user read; resolves at the OTP step. */
  submitCaptcha(supplierCode: string, password: string, captcha: string): Promise<void>;
  /** Submits the OTP the user received; resolves on the supplier PO page. A wrong OTP may be retried in place. */
  submitOtp(otp: string): Promise<void>;
  /** The PO ids on the supplier PO page; ids that fail `^\d{1,10}$` are dropped (INV-97). */
  listPoIds(): Promise<string[]>;
  /** The PO page as served. The id is validated before any fetch (INV-97). */
  fetchPoHtml(poId: string): Promise<string>;
  /** The SRV page of a PO as served. The id is validated before any fetch (INV-97). */
  fetchSrvHtml(poId: string): Promise<string>;
  /** Idempotent. */
  close(): Promise<void>;
}

export type ScraperErrorCode =
  | "edge-unavailable"
  | "portal-unreachable"
  | "wrong-captcha"
  | "wrong-otp"
  | "out-of-order"
  | "closed"
  | "invalid-po-id"
  | "fetch-failed";

// Fixed plain messages: none can carry the password, OTP, cookies or a page body (INV-81, INV-106).
const MESSAGES: Record<ScraperErrorCode, string> = {
  "edge-unavailable": "BHEL sync needs Microsoft Edge, which could not be started. Folder import still works.",
  "portal-unreachable": "The BHEL portal could not be reached. Check the internet connection and try again.",
  "wrong-captcha": "The captcha was not accepted. Type the new captcha and try again.",
  "wrong-otp": "The OTP was not accepted. Check the e-mail and try again.",
  "out-of-order": "The BHEL login steps were done out of order. Start the sync again.",
  closed: "The BHEL session has ended. Start the sync again.",
  "invalid-po-id": "A PO id must be 1 to 10 digits.",
  "fetch-failed": "A page could not be fetched from the BHEL portal.",
};

export class ScraperError extends Error {
  override readonly name = "ScraperError";
  readonly code: ScraperErrorCode;
  constructor(code: ScraperErrorCode) {
    super(MESSAGES[code]);
    this.code = code;
  }
}

export function isPoId(id: string): boolean {
  return zPoId.safeParse(id).success;
}

/** INV-97: rejects an id that is not 1 to 10 ASCII digits, before it reaches any URL. */
export function assertPoId(id: string): void {
  if (!isPoId(id)) throw new ScraperError("invalid-po-id");
}
