import { load } from "cheerio";
import { describe, expect, it } from "vite-plus/test";

import {
  CAPTCHA,
  isOtpPage,
  isPoListPage,
  LOGIN_FORM,
  OTP_INPUT,
  POPUPS,
  readPoIds,
} from "../../src/platform/playwright/selectors.ts";
import { LOGIN_HTML, OTP_HTML, OTP_INVALID_HTML, PO_LIST_HTML } from "./fixtures.ts";

const OTHER_URL = "https://bpl.bhel.com/mm/otp_check.asp";

describe("selectors on the synthetic login page", () => {
  const $ = load(LOGIN_HTML);

  it("finds each login field once", () => {
    expect(Object.values(LOGIN_FORM).map((selector) => $(selector).length)).toEqual([1, 1, 1, 1]);
  });

  it("finds every notice's checkbox and OK button", () => {
    const found = POPUPS.map(({ checkbox, ok }) => [checkbox && $(checkbox).length, $(ok).length]);
    expect(found).toEqual([
      [undefined, 1],
      [1, 1],
      [1, 1],
    ]);
  });

  it("the last captcha table holds the digit images and nothing else", () => {
    const inner = $(CAPTCHA).last();
    expect(inner.find("img").length).toBe(2);
    expect(inner.find("input").length).toBe(0);
  });
});

describe("page checks", () => {
  it("the OTP step is the page with an OTP field, also after a wrong OTP", () => {
    expect([LOGIN_HTML, OTP_HTML, OTP_INVALID_HTML, PO_LIST_HTML].map(isOtpPage)).toEqual([false, true, true, false]);
    expect(load(OTP_HTML)(OTP_INPUT).attr("name")).toBe("txtOTP");
  });

  it("the supplier PO page is known by its URL or by its headings", () => {
    expect(isPoListPage("https://bpl.bhel.com/mm/suppliers_po_page.asp", "<html></html>")).toBe(true);
    expect(isPoListPage("https://bpl.bhel.com/MM/Suppliers_PO_Page.asp?x=1", "<html></html>")).toBe(true);
    expect(isPoListPage(OTHER_URL, PO_LIST_HTML)).toBe(true);
    expect(isPoListPage(OTHER_URL, LOGIN_HTML)).toBe(false);
    expect(isPoListPage(OTHER_URL, OTP_HTML)).toBe(false);
  });
});

describe("readPoIds", () => {
  it("reads the first-column links in page order and drops ids that are not 1 to 10 digits (INV-97)", () => {
    expect(readPoIds(PO_LIST_HTML)).toEqual(["1000000001", "1000000002"]);
  });

  it("reads nothing from a page with no PO list", () => {
    expect(readPoIds(LOGIN_HTML)).toEqual([]);
  });
});
