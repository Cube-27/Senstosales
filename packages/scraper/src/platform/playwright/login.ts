// The login steps on the portal page (ARCHITECTURE §7.5): open the portal, dismiss the notices, shoot the captcha,
// submit supplier code + password + captcha, detect the OTP step, submit the OTP and confirm by the supplier PO page.
// Pages are read as strings by `selectors.ts`; nothing from a page is evaluated or used as a URL (C17). A Playwright
// failure here becomes `portal-unreachable` in the session guard (session-guard.ts).
import type { Locator, Page } from "playwright-core";

import { ScraperError } from "../../port.ts";
import type { Login } from "../../session-guard.ts";
import {
  CAPTCHA,
  classifyPage,
  LOGIN_FORM,
  LOGIN_URL,
  OTP_INPUT,
  OTP_SUBMIT,
  PO_LIST_URL,
  POPUPS,
} from "./selectors.ts";

const NAV_TIMEOUT_MS = 60_000;

const portalPage = async (page: Page) => classifyPage(page.url(), await page.content());

/** Clicks `submit` and waits for the page it loads. */
async function submitAndLoad(page: Page, submit: Locator): Promise<void> {
  await Promise.all([page.waitForEvent("load", { timeout: NAV_TIMEOUT_MS }), submit.click()]);
}

/** Notices shown over the login form when it loads; the ones present are ticked and closed in order (D-0530). */
async function dismissPopups(page: Page): Promise<void> {
  for (const popup of POPUPS) {
    const ok = page.locator(popup.ok);
    if (!(await ok.isVisible())) continue;
    if (popup.checkbox) await page.locator(popup.checkbox).check();
    await ok.click();
  }
}

/** Opens the login page and returns the captcha as PNG bytes. */
export async function openLogin(page: Page): Promise<Uint8Array> {
  await page.goto(LOGIN_URL, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
  await dismissPopups(page);
  return page.locator(CAPTCHA).last().screenshot();
}

/** Submits the login form. Resolves `otp` at the OTP step, or `po-list` when the portal skips it (EC-65). */
export async function submitLogin(page: Page, login: Login): Promise<"otp" | "po-list"> {
  await page.locator(LOGIN_FORM.supplierCode).fill(login.supplierCode);
  await page.locator(LOGIN_FORM.password).fill(login.password);
  await page.locator(LOGIN_FORM.captcha).fill(login.captcha);
  await submitAndLoad(page, page.locator(LOGIN_FORM.submit));
  const at = await portalPage(page);
  if (at === "other") throw new ScraperError("wrong-captcha");
  return at;
}

/** Submits the OTP; resolves on the supplier PO page. The OTP form shown again means a wrong OTP. */
export async function submitOtp(page: Page, otp: string): Promise<void> {
  await page.locator(OTP_INPUT).first().fill(otp);
  await submitAndLoad(page, page.locator(OTP_SUBMIT).first());
  const at = await portalPage(page);
  if (at === "po-list") return;
  if (at === "otp") throw new ScraperError("wrong-otp");
  // The portal may land elsewhere after a good OTP; the supplier PO page then confirms the login.
  await page.goto(PO_LIST_URL, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
  if ((await portalPage(page)) !== "po-list") throw new ScraperError("portal-unreachable");
}
