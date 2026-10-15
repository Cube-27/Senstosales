// Display formatters shared by screens and exports, so the two never disagree (ARCHITECTURE §11.2). Output matches
// the legacy frontend's visible strings (SPEC-04 §4.4, A-2); all arithmetic stays on the branded integers (C3).
import type { Fy, IsoDate, Money, Qty } from "@senstosales/domain";
import { MONEY_DP, QTY_DP, moneyToString, roundMoney } from "@senstosales/domain";

const RUPEE = "₹";
const ONE_UNIT = 10 ** QTY_DP;
/** Money units in one rupee, a lakh and a crore. */
const ONE_RUPEE = 10 ** MONEY_DP;
const LAKH = 100_000 * ONE_RUPEE;
const CRORE = 10_000_000 * ONE_RUPEE;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian grouping: `"12345678"` -> `"1,23,45,678"` (the last three digits, then pairs). */
function groupIndian(digits: string): string {
  const groups = [digits.slice(-3)];
  for (let end = digits.length - 3; end > 0; end -= 2) groups.unshift(digits.slice(Math.max(0, end - 2), end));
  return groups.join(",");
}

/**
 * `n / unit` rounded half toward +infinity, as legacy `Math.round` does, in exact integer arithmetic. No sum may
 * pass 2^53, so it splits off the remainder instead of adding `unit / 2` first.
 */
function roundDiv(n: number, unit: number): number {
  const rem = n % unit;
  const [floor, up] = rem < 0 ? [(n - rem) / unit - 1, rem + unit] : [(n - rem) / unit, rem];
  return up * 2 >= unit ? floor + 1 : floor;
}

/** `n / unit` as a number to 2 dp, half up as {@link roundDiv}: what the legacy exports wrote for quantities and money. */
const hundredthsNumber = (n: number, unit: number): number => roundDiv(n, unit / 100) / 100;

/** A quantity as an export's number cell: `1.255` -> `1.26` (SPEC-13, legacy `round(x, 2)`). */
export const qtyNumber = (q: Qty): number => hundredthsNumber(q, ONE_UNIT);

/** An amount as an export's number cell: `826.004` -> `826`. */
export const moneyNumber = (m: Money): number => hundredthsNumber(m, ONE_RUPEE);

/** A count of records or items: `1234567` -> `"12,34,567"`. */
export const fmtCount = (n: number): string => (n < 0 ? `-${groupIndian(String(-n))}` : groupIndian(String(n)));

/** A quantity in whole units, as legacy shows every quantity: `2.5` -> `"3"` (EC-21). */
export const fmtQty = (q: Qty): string => fmtCount(roundDiv(q, ONE_UNIT));

/** GEMC amounts and rates show up to 5 dp, others up to 2 (A-12). */
interface Precision {
  readonly gemc: boolean;
}

/** A unit rate without the rupee sign (legacy rate cells draw it apart): `1234.50` -> `"1,234.5"`. */
export function fmtRate(m: Money, { gemc }: Precision): string {
  const [int = "", frac] = moneyToString(gemc ? m : roundMoney(m, 2)).split(".");
  const sign = int.startsWith("-") ? "-" : "";
  return sign + groupIndian(int.slice(sign.length)) + (frac === undefined ? "" : `.${frac}`);
}

/** An amount with every decimal place and no grouping, as the legacy DC prints one: `1234.5` -> `"1234.50"`. */
export function fmtFixed(m: Money, { gemc }: Precision): string {
  const dp = gemc ? 5 : 2;
  const [int = "", frac = ""] = moneyToString(roundMoney(m, dp)).split(".");
  return `${int}.${frac.padEnd(dp, "0")}`;
}

/** A full-precision amount: `-848.755` -> `"-₹848.76"`; GEMC `719.27966` -> `"₹719.27966"`. */
export function fmtMoney(m: Money, precision: Precision): string {
  const rate = fmtRate(m, precision);
  return rate.startsWith("-") ? `-${RUPEE}${rate.slice(1)}` : RUPEE + rate;
}

/** `abs / unit` to two decimals, half up: `12345670` lakh units -> `"12.35"`. */
function hundredths(abs: number, unit: number): string {
  const h = roundDiv(abs, unit / 100);
  return `${(h - (h % 100)) / 100}.${String(h % 100).padStart(2, "0")}`;
}

/** Renders a magnitude in money units as whole rupees below a lakh, else lakh or crore to two decimals. */
function compact(negative: boolean, abs: number, gap: string): string {
  let body: string;
  if (abs >= CRORE) body = `${hundredths(abs, CRORE)}${gap}Cr`;
  else if (abs >= LAKH) body = `${hundredths(abs, LAKH)}${gap}L`;
  else body = groupIndian(String(roundDiv(abs, ONE_RUPEE)));
  const sign = negative ? "-" + gap : "";
  return sign + RUPEE + body;
}

/** A compact amount, rounded to whole rupees first: `150000` -> `"₹1.50L"`, `99999.5` -> `"₹1.00L"`. */
export function fmtMoneyCompact(m: Money): string {
  const rupees = roundDiv(m, ONE_RUPEE);
  return compact(rupees < 0, Math.abs(rupees) * ONE_RUPEE, "");
}

/**
 * The delivery tracker's compact amount, which legacy rounds on the magnitude and only below a lakh:
 * `-150000` -> `"- ₹1.50 L"`, `99999.5` -> `"₹1,00,000"`.
 */
export function fmtMoneyCompactSpaced(m: Money): string {
  const abs = Math.abs(m);
  return compact(m < 0 && abs >= ONE_RUPEE / 2, abs, " ");
}

/** The words for 0..19, by index. */
const BELOW_20 = [
  "",
  ..."One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split(
    " ",
  ),
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 1..999 in words, `""` for 0: `118` -> `"One Hundred and Eighteen"`. */
function hundredsWords(n: number): string {
  const below100 = n % 100;
  const tens =
    below100 < 20 ? BELOW_20[below100]! : `${TENS[Math.floor(below100 / 10)]} ${BELOW_20[below100 % 10]}`.trimEnd();
  if (n < 100) return tens;
  const hundreds = `${BELOW_20[Math.floor(n / 100)]} Hundred`;
  return below100 === 0 ? hundreds : `${hundreds} and ${tens}`;
}

/** Whole rupees in Indian words: `12345678` -> `"One Crore Twenty Three Lakh Forty Five Thousand Six Hundred and …"`. */
function rupeeWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  if (crore >= 1000) throw new RangeError("Amount too large to write in words");
  const parts: Array<[number, string]> = [
    [crore, " Crore"],
    [Math.floor(n / 100_000) % 100, " Lakh"],
    [Math.floor(n / 1000) % 100, " Thousand"],
    [n % 1000, ""],
  ];
  return parts.flatMap(([count, scale]) => (count > 0 ? [hundredsWords(count) + scale] : [])).join(" ");
}

/**
 * The legacy invoice's amount in words: `1180.5` -> `"Rupees One Thousand One Hundred and Eighty and Paise Fifty
 * Only"`. Paise are rounded half up and can reach a hundred (`5.996` -> `"… and Paise One Hundred Only"`); legacy
 * could not write a thousand crore or more (EC-49).
 */
export function fmtAmountWords(m: Money): string {
  const rem = m % ONE_RUPEE;
  const paise = roundDiv(rem, ONE_RUPEE / 100);
  const words = `Rupees ${rupeeWords((m - rem) / ONE_RUPEE)}`;
  return `${words}${paise > 0 ? ` and Paise ${rupeeWords(paise)}` : ""} Only`;
}

/** `2025-01-05` -> `"05/01/2025"`; no date -> `"—"`. */
export const fmtDate = (d: IsoDate | null): string =>
  d === null ? "—" : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** The PO delivery and deviation screens' format: `2025-01-05` -> `"05 Jan 2025"`; no date -> `"-"`. */
export const fmtDateMonthName = (d: IsoDate | null): string =>
  d === null ? "-" : `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** `2024-25` -> `"FY 2024-25"`. */
export const fmtFy = (fy: Fy): string => `FY ${fy}`;

/** Days to a delivery date as the tracker export words them: `-12` -> `"12 days overdue"`, `0` -> `"Due Today"`. */
export function fmtDaysToDue(days: number): string {
  if (days < 0) return `${-days} days overdue`;
  return days === 0 ? "Due Today" : `Due in ${days} days`;
}
