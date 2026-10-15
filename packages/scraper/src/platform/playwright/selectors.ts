// Everything the adapter knows about the BHEL portal's pages, in one place (SPEC-19 §2, §9): the constant origin and
// paths, the CSS selectors the browser acts on, and the checks that read a page as a string. A portal change is fixed
// here and in the fixtures under packages/scraper/fixtures. Taken from the legacy scraper's visible behaviour until the
// SPEC-01 spike records the live flow (D-0530). Page content is only ever read, never executed or used as a URL (C17).
import { load } from "cheerio";

/** INV-97: the only origin the adapter ever contacts. */
export const PORTAL_ORIGIN = "https://bpl.bhel.com";
export const LOGIN_URL = `${PORTAL_ORIGIN}/mm/`;
export const PO_LIST_URL = `${PORTAL_ORIGIN}/mm/suppliers_po_page.asp`;
export const PO_DETAIL_URL = `${PORTAL_ORIGIN}/mm/podtls.asp`;
export const SRV_LIST_URL = `${PORTAL_ORIGIN}/mm/listsrv.asp`;

/** The notices over the login form, dismissed in order: tick the checkbox (if any), then press OK. */
export const POPUPS: ReadonlyArray<{ readonly checkbox?: string; readonly ok: string }> = [
  { ok: "#okButton1" },
  { checkbox: "#myCheckbox", ok: "#okButton" },
  { checkbox: "#suvidhaAgree", ok: "#suvidhaOkBtn" },
];

export const LOGIN_FORM = {
  supplierCode: "input[name='supp_code']",
  password: "input[name='b2b_passwd']",
  captcha: "input[name='c']",
  submit: "input[name='search']",
} as const;

/** The table that holds only the captcha digits; the innermost (last) match is the one shot. */
export const CAPTCHA = "table:has(img[src*='captcha.asp'])";

export const OTP_INPUT = "input[name*='otp' i], input[id*='otp' i], input[placeholder*='otp' i]";
export const OTP_SUBMIT =
  "button:has-text('Submit'), button:has-text('Verify'), button[type='submit'], input[type='submit']";

/** The first cell of each PO list row links the PO id. */
const PO_ID_LINK = "table tr td:first-child a";

/** Where a page shows the portal to be: the supplier PO page (which confirms the login, ARCHITECTURE §7.5), the OTP
 * step, or anywhere else. */
export function classifyPage(url: string, html: string): "po-list" | "otp" | "other" {
  if (new URL(url).pathname.toLowerCase().endsWith("/suppliers_po_page.asp")) return "po-list";
  const $ = load(html);
  const text = $.text().toLowerCase();
  if (text.includes("purchase orders on:") && text.includes("po status")) return "po-list";
  return $(OTP_INPUT).length > 0 ? "otp" : "other";
}

/** The texts of the PO id links on the supplier PO page, in page order. The session guard drops any that is not a PO
 * id (INV-97). */
export function readPoIds(html: string): string[] {
  const $ = load(html);
  return $(PO_ID_LINK)
    .map((_, a) => $(a).text().trim())
    .get();
}
