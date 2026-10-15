// The synthetic portal-shaped pages under packages/scraper/fixtures, read once.
import { readFileSync } from "node:fs";

const read = (name: string) => readFileSync(new URL(`../../fixtures/${name}.html`, import.meta.url), "utf8");

export const LOGIN_HTML = read("login");
export const OTP_HTML = read("otp");
export const OTP_INVALID_HTML = read("otp-invalid");
export const PO_LIST_HTML = read("po-list");
