import { load } from "cheerio";
import { describe, expect, it } from "vite-plus/test";

import {
  CAPTCHA,
  classifyPage,
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
    expect(inner.find("img")).toHaveLength(2);
    expect(inner.find("input")).toHaveLength(0);
  });
});

describe("classifyPage", () => {
  it("reads each synthetic page as the step it shows", () => {
    expect([LOGIN_HTML, OTP_HTML, OTP_INVALID_HTML, PO_LIST_HTML].map((html) => classifyPage(OTHER_URL, html))).toEqual(
      ["other", "otp", "otp", "po-list"],
    );
    expect(load(OTP_HTML)(OTP_INPUT).attr("name")).toBe("txtOTP");
  });

  it("knows the supplier PO page by its URL alone", () => {
    expect(classifyPage("https://bpl.bhel.com/mm/suppliers_po_page.asp", "<html></html>")).toBe("po-list");
    expect(classifyPage("https://bpl.bhel.com/MM/Suppliers_PO_Page.asp?x=1", "<html></html>")).toBe("po-list");
  });
});

describe("readPoIds", () => {
  it("reads the first-column link texts in page order, trimmed", () => {
    expect(readPoIds(PO_LIST_HTML)).toEqual(["1000000001", "1000000002", "12AB", "10000000003"]);
  });

  it("reads nothing from a page with no PO list", () => {
    expect(readPoIds(LOGIN_HTML)).toEqual([]);
  });
});
