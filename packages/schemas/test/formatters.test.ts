import type { IsoDate, Money, Qty, Result } from "@senstosales/domain";
import { fyOf, parseIsoDate, parseMoney, parseQty } from "@senstosales/domain";
import { describe, expect, it } from "vite-plus/test";

import {
  fmtAmountWords,
  fmtCount,
  fmtDate,
  fmtDateDashed,
  fmtDateInput,
  fmtDateMonthName,
  fmtDaysToDue,
  fmtFixed,
  fmtFy,
  fmtFlagType,
  fmtInstantDate,
  fmtInstantDateTime,
  fmtMoney,
  fmtMoneyCompact,
  fmtMoneyCompactSpaced,
  fmtQty,
  fmtQtyInput,
  fmtRate,
  foldRepeatedLines,
  istDateOf,
  moneyNumber,
  parseDateInput,
  parseQtyInput,
  qtyNumber,
} from "../src/index.ts";

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const qty = (s: string): Qty => unwrap(parseQty(s));
const money = (s: string): Money => unwrap(parseMoney(s));
const date = (s: string): IsoDate => unwrap(parseIsoDate(s));

// Expected strings are the legacy frontend's visible output for the same value (SPEC-04 §4.4, A-2), except rows marked
// "legacy": there legacy printed a negative zero ("-0", "-₹0") or rounded a binary float tie down; these print
// zero unsigned and round exact ties half away from zero (D-0021).

describe("fmtQty: whole units, Indian grouping", () => {
  it.each([
    ["0", "0"],
    ["1", "1"],
    ["2.499", "2"],
    ["2.5", "3"],
    ["-2.5", "-2"],
    ["-2.501", "-3"],
    ["-0.4", "0"], // legacy "-0"
    ["1234", "1,234"],
    ["123456", "1,23,456"],
    ["12345678.9", "1,23,45,679"],
    ["-100000", "-1,00,000"],
    ["9007199254740.499", "90,07,19,92,54,740"],
    ["-9007199254740.501", "-90,07,19,92,54,741"],
  ])("%s -> %s", (q, expected) => {
    expect(fmtQty(qty(q))).toBe(expected);
  });
});

describe("qtyNumber and moneyNumber: export number cells", () => {
  it.each([
    ["0", 0],
    ["1.25", 1.25],
    ["12.345", 12.345],
    ["0.001", 0.001],
    ["-0.5", -0.5],
    ["15", 15],
  ])("qty %s -> %d, exact to 3 dp", (q, expected) => {
    expect(qtyNumber(qty(q))).toBe(expected);
  });

  it.each([
    ["826", 826],
    ["400.00499", 400],
    ["400.005", 400.01],
    ["0.1", 0.1],
    ["1180.5", 1180.5],
  ])("money %s -> %d, 2 dp half up", (m, expected) => {
    expect(moneyNumber(money(m), { gemc: false })).toBe(expected);
  });

  it.each([
    ["94.06779", 94.06779],
    ["400.00499", 400.00499],
    ["826", 826],
  ])("GEMC money %s -> %d, exact to 5 dp (A-12)", (m, expected) => {
    expect(moneyNumber(money(m), { gemc: true })).toBe(expected);
  });
});

describe("fmtCount", () => {
  it.each([
    [0, "0"],
    [25, "25"],
    [1234, "1,234"],
    [1234567, "12,34,567"],
  ])("%i -> %s", (n, expected) => {
    expect(fmtCount(n)).toBe(expected);
  });
});

describe("fmtMoney: rupee sign, 2 dp, trailing zeros dropped", () => {
  it.each([
    ["0", "₹0"],
    ["848.75", "₹848.75"],
    ["500", "₹500"],
    ["1.50", "₹1.5"],
    ["719.27966", "₹719.28"],
    ["848.755", "₹848.76"], // legacy "₹848.75"
    ["848.745", "₹848.75"],
    ["0.004", "₹0"],
    ["0.005", "₹0.01"],
    ["99999.999", "₹1,00,000"],
    ["12345678.9", "₹1,23,45,678.9"],
    ["-848.75", "-₹848.75"],
    ["-848.755", "-₹848.76"], // legacy "-₹848.75"
    ["-0.001", "₹0"], // legacy "-₹0"
  ])("%s -> %s", (m, expected) => {
    expect(fmtMoney(money(m), { gemc: false })).toBe(expected);
  });
});

describe("fmtMoney: GEMC at 5 dp (A-12)", () => {
  it.each([
    ["0", "₹0"],
    ["100", "₹100"],
    ["719.2", "₹719.2"],
    ["719.27966", "₹719.27966"],
    ["1234567.12345", "₹12,34,567.12345"],
    ["-0.00001", "-₹0.00001"],
  ])("%s -> %s", (m, expected) => {
    expect(fmtMoney(money(m), { gemc: true })).toBe(expected);
  });
});

describe("fmtRate: as fmtMoney without the rupee sign", () => {
  it.each([
    ["0", false, "0"],
    ["848.75", false, "848.75"],
    ["1234.50", false, "1,234.5"],
    ["719.27966", false, "719.28"],
    ["719.27966", true, "719.27966"],
    ["-12.3", false, "-12.3"],
  ])("%s gemc=%s -> %s", (m, gemc, expected) => {
    expect(fmtRate(money(m), { gemc })).toBe(expected);
  });
});

describe("fmtFixed: every decimal place, no grouping (legacy DC consignment value)", () => {
  it.each([
    ["0", false, "0.00"],
    ["1234.5", false, "1234.50"],
    ["1234567.891", false, "1234567.89"],
    ["0.005", false, "0.01"],
    ["719.27966", false, "719.28"],
    ["719.2796", true, "719.27960"],
    ["12", true, "12.00000"],
  ])("%s gemc=%s -> %s", (m, gemc, expected) => {
    expect(fmtFixed(money(m), { gemc })).toBe(expected);
  });
});

describe("fmtMoneyCompact: whole rupees, lakh and crore", () => {
  it.each([
    ["0", "₹0"],
    ["848.49", "₹848"],
    ["848.75", "₹849"],
    ["99999.49", "₹99,999"],
    ["99999.5", "₹1.00L"],
    ["150000", "₹1.50L"],
    ["1234567", "₹12.35L"],
    ["9999999", "₹100.00L"],
    ["10000000", "₹1.00Cr"],
    ["123456789", "₹12.35Cr"],
    ["-150000", "-₹1.50L"],
    ["-848.75", "-₹849"],
    ["-2.5", "-₹2"],
    ["-0.4", "₹0"],
  ])("%s -> %s", (m, expected) => {
    expect(fmtMoneyCompact(money(m))).toBe(expected);
  });

  it.each([
    ["0", "₹0"],
    ["848.75", "₹849"],
    ["99999.5", "₹1,00,000"],
    ["150000", "₹1.50 L"],
    ["123456789", "₹12.35 Cr"],
    ["-150000", "- ₹1.50 L"],
    ["-2.5", "- ₹3"],
    ["-0.5", "- ₹1"],
    ["-0.4", "₹0"], // legacy "- ₹0"
  ])("fmtMoneyCompactSpaced: %s -> %s", (m, expected) => {
    expect(fmtMoneyCompactSpaced(money(m))).toBe(expected);
  });
});

describe("fmtDate: DD/MM/YYYY", () => {
  it.each([
    ["2025-01-05", "05/01/2025"],
    ["2024-12-31", "31/12/2024"],
    ["2024-02-29", "29/02/2024"],
  ])("%s -> %s", (d, expected) => {
    expect(fmtDate(date(d))).toBe(expected);
  });

  it("shows an empty date as an em dash", () => {
    expect(fmtDate(null)).toBe("—");
  });
});

describe("fmtDateMonthName: DD Mon YYYY", () => {
  it.each([
    ["2025-01-05", "05 Jan 2025"],
    ["2024-09-30", "30 Sep 2024"],
    ["2024-12-31", "31 Dec 2024"],
  ])("%s -> %s", (d, expected) => {
    expect(fmtDateMonthName(date(d))).toBe(expected);
  });

  it("shows an empty date as a hyphen", () => {
    expect(fmtDateMonthName(null)).toBe("-");
  });
});

describe("fmtFy", () => {
  it.each([
    ["2025-03-31", "FY 2024-25"],
    ["2025-04-01", "FY 2025-26"],
    ["2000-03-31", "FY 1999-00"],
  ])("FY of %s -> %s", (d, expected) => {
    expect(fmtFy(fyOf(date(d)))).toBe(expected);
  });
});

describe("fmtDaysToDue: the tracker export's Days Overdue, as legacy (no singular)", () => {
  it.each([
    [-12, "12 days overdue"],
    [-1, "1 days overdue"],
    [0, "Due Today"],
    [1, "Due in 1 days"],
    [14, "Due in 14 days"],
  ])("%i -> %s", (days, expected) => {
    expect(fmtDaysToDue(days)).toBe(expected);
  });
});

describe("fmtAmountWords: legacy Indian rupee words", () => {
  it.each([
    ["0", "Rupees Zero Only"],
    ["1", "Rupees One Only"],
    ["15", "Rupees Fifteen Only"],
    ["40", "Rupees Forty Only"],
    ["99", "Rupees Ninety Nine Only"],
    ["100", "Rupees One Hundred Only"],
    ["101", "Rupees One Hundred and One Only"],
    ["1180.5", "Rupees One Thousand One Hundred and Eighty and Paise Fifty Only"],
    ["100000", "Rupees One Lakh Only"],
    [
      "12345678.9",
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred and Seventy Eight and Paise Ninety Only",
    ],
    ["2157.83898", "Rupees Two Thousand One Hundred and Fifty Seven and Paise Eighty Four Only"],
    ["0.00499", "Rupees Zero Only"],
    ["0.005", "Rupees Zero and Paise One Only"],
    // Paise that round to a hundred carry into the rupees; no "Paise Zero" or "Paise One Hundred".
    ["5.996", "Rupees Six Only"],
    ["31391.99999", "Rupees Thirty One Thousand Three Hundred and Ninety Two Only"],
    [
      `${"9".repeat(10)}.99`, // just under a thousand crore
      "Rupees Nine Hundred and Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred and Ninety Nine and Paise Ninety Nine Only",
    ],
  ])("%s -> %s", (m, expected) => {
    expect(fmtAmountWords(money(m))).toBe(expected);
  });

  it("fails from a thousand crore, as legacy did (EC-49)", () => {
    expect(() => fmtAmountWords(money("10000000000"))).toThrow("Amount too large to write in words");
  });
});

describe("fmtDateDashed: the pending summary's export date", () => {
  it.each([
    ["2025-06-01", "01-06-2025"],
    ["2026-12-31", "31-12-2026"],
  ])("%s -> %s", (d, expected) => {
    expect(fmtDateDashed(d as IsoDate)).toBe(expected);
  });
});

describe("foldRepeatedLines: a description with each repeated line once (case and spacing ignored)", () => {
  it.each([
    ["Hex bolt M10", "Hex bolt M10"],
    ["  Hex bolt M10  ", "Hex bolt M10"],
    ["Gasket set\nGasket set\nSize 50", "Gasket set\nSize 50"],
    ["Gasket  SET\n gasket set \nSize 50", "Gasket  SET\nSize 50"],
    ["Line one\n\n  Line two  \r\nLine one", "Line one\nLine two"],
    ["A\nB", "A\nB"],
    ["", ""],
  ])("%j -> %j", (text, expected) => {
    expect(foldRepeatedLines(text)).toBe(expected);
  });
});

describe("fmtQtyInput and parseQtyInput: a quantity field", () => {
  it.each([
    ["2500", "2.5"],
    ["1", "0.001"],
    ["12000", "12"],
  ])("shows %s milli-units as %s", (milli, expected) => {
    expect(fmtQtyInput(Number(milli) as Qty)).toBe(expected);
  });

  it.each<[string, number | null]>([
    ["2.5", 2500],
    [" 12 ", 12000],
    ["0.001", 1],
    ["", 0],
    ["-1", 0],
    ["1.2345", null],
    ["abc", null],
    ["1.", null],
  ])("reads %j as %s", (text, expected) => {
    expect(parseQtyInput(text)).toBe(expected);
  });
});

describe("fmtDateInput: Mon DD, YYYY", () => {
  it.each([
    ["2019-12-22", "Dec 22, 2019"],
    ["2025-01-05", "Jan 05, 2025"],
  ])("%s -> %s", (d, expected) => {
    expect(fmtDateInput(date(d))).toBe(expected);
  });
});

describe("parseDateInput: the legacy picker's typed formats", () => {
  it.each<[string, string | null]>([
    ["2019-12-22", "2019-12-22"],
    ["2019-1-5", "2019-01-05"],
    ["Dec 22, 2019", "2019-12-22"],
    ["dec 22 2019", "2019-12-22"],
    ["22 Dec 2019", "2019-12-22"],
    ["22 December 2019", "2019-12-22"],
    ["5 Sept 2024", "2024-09-05"],
    ["  22   Dec   2019 ", "2019-12-22"],
    ["22/12/2019", "2019-12-22"],
    ["05/01/2025", "2025-01-05"],
    ["5-1-2025", "2025-01-05"],
    ["05.01.2025", "2025-01-05"],
    // Day-first is no date, so month-first.
    ["12/22/2019", "2019-12-22"],
    ["29/02/2024", "2024-02-29"],
    ["29/02/2023", null],
    ["31/31/2024", null],
    ["22/12-2019", null],
    ["Decoy 22, 2019", null],
    ["De 22, 2019", null],
    ["2019-02-30", null],
    ["", null],
    ["tomorrow", null],
  ])("%j -> %s", (text, expected) => {
    expect(parseDateInput(text)).toBe(expected);
  });
});

describe("fmtFlagType", () => {
  it.each([
    ["QTY_MISMATCH", "QTY MISMATCH"],
    ["MANUAL_ADJUSTMENT_OVERLAP", "MANUAL ADJUSTMENT OVERLAP"],
  ])("%s", (type, expected) => {
    expect(fmtFlagType(type)).toBe(expected);
  });
});

describe("fmtInstantDate: an instant's IST calendar date", () => {
  it.each([
    ["2025-06-01T05:30:00.000Z", "01/06/2025"],
    // 18:30 UTC is midnight IST: the next day.
    ["2025-06-01T18:29:59.999Z", "01/06/2025"],
    ["2025-06-01T18:30:00.000Z", "02/06/2025"],
    ["2024-12-31T20:00:00.000Z", "01/01/2025"],
  ])("%s -> %s", (at, expected) => {
    expect(fmtInstantDate(at)).toBe(expected);
  });
});

describe("istDateOf: an instant's IST calendar date as a date value", () => {
  it.each([
    ["2025-06-01T18:29:59.999Z", "2025-06-01"],
    ["2025-06-01T18:30:00.000Z", "2025-06-02"],
    ["2024-12-31T20:00:00.000Z", "2025-01-01"],
  ])("%s -> %s", (at, expected) => {
    expect(istDateOf(at)).toBe(expected);
  });
});

describe("fmtInstantDateTime: the ledger and deviations timestamp, in IST as legacy", () => {
  it.each([
    ["2025-06-01T05:30:00.000Z", "01/06/2025, 11:00:00 IST"],
    ["2025-06-01T18:30:05.900Z", "02/06/2025, 00:00:05 IST"],
    ["2024-12-31T20:00:00.000Z", "01/01/2025, 01:30:00 IST"],
  ])("%s -> %s", (at, expected) => {
    expect(fmtInstantDateTime(at)).toBe(expected);
  });
});
