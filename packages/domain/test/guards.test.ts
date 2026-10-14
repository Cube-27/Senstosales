import { describe, expect, it } from "vite-plus/test";

import {
  acceptIncoming,
  changedImmutableFields,
  deleteBlock,
  validateDcInvoiceLines,
  validateDcLines,
  validateDirectInvoiceLines,
} from "../src/index.ts";
import { date, money, qty } from "./unwrap.ts";

// INV-42, INV-43: an upload older than the stored document is skipped; same or newer is accepted (spec §4, §7.2).
describe("INV-42/INV-43: acceptIncoming", () => {
  it.each([
    ["nothing stored", null, "2025-06-10", true],
    ["newer", "2025-06-10", "2025-06-11", true],
    ["same date", "2025-06-10", "2025-06-10", true],
    ["newer across FY", "2025-03-31", "2025-04-01", true],
    ["older by a day", "2025-06-10", "2025-06-09", false],
    ["older across FY", "2025-04-01", "2025-03-31", false],
  ])("%s: stored %s, incoming %s -> %s", (_, stored, incoming, expected) => {
    expect(acceptIncoming(stored === null ? null : date(stored), date(incoming))).toBe(expected);
  });
});

// INV-35: delete is refused while backward links exist (A-14, ARCHITECTURE §6.7).
describe("INV-35: deleteBlock", () => {
  it.each([
    ["DC with no links", () => deleteBlock("dc", { invoices: 0, srvItems: 0 }), null],
    ["DC with an invoice", () => deleteBlock("dc", { invoices: 1, srvItems: 0 }), "dc-has-invoice"],
    ["DC with a linked SRV item", () => deleteBlock("dc", { invoices: 0, srvItems: 2 }), "dc-linked-srv"],
    ["DC with both: invoice reported", () => deleteBlock("dc", { invoices: 1, srvItems: 1 }), "dc-has-invoice"],
    ["invoice with no links", () => deleteBlock("invoice", { srvItems: 0 }), null],
    ["invoice with a linked SRV item", () => deleteBlock("invoice", { srvItems: 1 }), "invoice-linked-srv"],
    ["PO with nothing", () => deleteBlock("po", { dcs: 0, invoices: 0 }), null],
    ["PO with a DC", () => deleteBlock("po", { dcs: 1, invoices: 0 }), "po-has-dc"],
    ["PO with a PO-direct invoice", () => deleteBlock("po", { dcs: 0, invoices: 1 }), "po-has-invoice"],
    ["PO with both: DC reported", () => deleteBlock("po", { dcs: 3, invoices: 2 }), "po-has-dc"],
    ["SRV is never blocked", () => deleteBlock("srv", {}), null],
  ])("%s -> %s", (_, run, expected) => {
    expect(run()).toBe(expected);
  });
});

const PO_ITEMS = new Set(["item-1", "item-2"]);

// INV-32 (DC) and INV-31 (PO-direct invoice): at least one line, each qty > 0 on an item of the PO, no upper cap
// (spec §5, A-7, C6). Both validators apply the same rule.
describe.each([
  ["INV-32: validateDcLines", validateDcLines],
  ["INV-31: validateDirectInvoiceLines", validateDirectInvoiceLines],
])("%s", (_, validate) => {
  it.each([
    ["one line", [{ poItemId: "item-1", qty: qty("4") }], []],
    [
      "two items",
      [
        { poItemId: "item-1", qty: qty("0.001") },
        { poItemId: "item-2", qty: qty("10") },
      ],
      [],
    ],
    // No cap: far above any ordered or pending quantity still saves (A-7).
    ["qty far above ordered", [{ poItemId: "item-1", qty: qty("999999") }], []],
    ["no lines", [], [{ code: "no-lines", path: "lines", message: "Add at least one item." }]],
    [
      "qty 0",
      [{ poItemId: "item-1", qty: qty("0") }],
      [{ code: "qty-not-positive", path: "lines.0.qty", message: "Quantity must be more than zero." }],
    ],
    [
      "negative qty",
      [
        { poItemId: "item-1", qty: qty("4") },
        { poItemId: "item-2", qty: qty("-0.001") },
      ],
      [{ code: "qty-not-positive", path: "lines.1.qty", message: "Quantity must be more than zero." }],
    ],
    [
      "item of another PO",
      [{ poItemId: "item-9", qty: qty("1") }],
      [{ code: "line-not-on-po", path: "lines.0.poItemId", message: "This item is not on the PO." }],
    ],
    [
      "both problems on one line",
      [{ poItemId: "item-9", qty: qty("0") }],
      [
        { code: "line-not-on-po", path: "lines.0.poItemId", message: "This item is not on the PO." },
        { code: "qty-not-positive", path: "lines.0.qty", message: "Quantity must be more than zero." },
      ],
    ],
  ])("%s", (_name, lines, expected) => {
    expect(validate({ poItemIds: PO_ITEMS, lines })).toEqual(expected);
  });
});

// INV-29: a DC-sourced invoice has exactly the DC's lines with qty = DC qty and rate = PO item rate (A-8).
describe("INV-29: validateDcInvoiceLines", () => {
  const dcLines = [
    { dcItemId: "dci-1", qty: qty("4"), poRate: money("719.27966") },
    { dcItemId: "dci-2", qty: qty("2.5"), poRate: money("100") },
  ];
  const exact = [
    { dcItemId: "dci-1", qty: qty("4"), rate: money("719.27966") },
    { dcItemId: "dci-2", qty: qty("2.5"), rate: money("100") },
  ];

  it.each([
    ["exactly the DC's lines", exact, []],
    ["the DC's lines in another order", [exact[1]!, exact[0]!], []],
    [
      "qty differs by 0.001",
      [{ ...exact[0]!, qty: qty("3.999") }, exact[1]!],
      [{ code: "dc-qty-mismatch", path: "lines.0.qty", message: "Quantity must equal the DC quantity (4)." }],
    ],
    [
      "qty above the DC qty",
      [exact[0]!, { ...exact[1]!, qty: qty("3") }],
      [{ code: "dc-qty-mismatch", path: "lines.1.qty", message: "Quantity must equal the DC quantity (2.5)." }],
    ],
    [
      "rate differs by 0.00001",
      [{ ...exact[0]!, rate: money("719.27967") }, exact[1]!],
      [{ code: "rate-mismatch", path: "lines.0.rate", message: "Rate must equal the PO rate (719.27966)." }],
    ],
    [
      "a DC line left out",
      [exact[0]!],
      [{ code: "dc-line-missing", path: "lines", message: "Every DC item must be on the invoice." }],
    ],
    [
      "a line that is not on the DC",
      [...exact, { dcItemId: "dci-9", qty: qty("1"), rate: money("100") }],
      [{ code: "line-not-on-dc", path: "lines.2.dcItemId", message: "This item is not on the DC." }],
    ],
    [
      "a DC line twice",
      [...exact, exact[1]!],
      [{ code: "duplicate-line", path: "lines.2.dcItemId", message: "This DC item is already on the invoice." }],
    ],
    ["no lines", [], [{ code: "dc-line-missing", path: "lines", message: "Every DC item must be on the invoice." }]],
  ])("%s", (_name, lines, expected) => {
    expect(validateDcInvoiceLines({ dcLines, lines })).toEqual(expected);
  });
});

// INV-33: DC and invoice line quantities and rates never change after save; header fields are editable (A-14).
describe("INV-33: changedImmutableFields", () => {
  const before = [
    { id: "l-1", qty: qty("4"), rate: money("100") },
    { id: "l-2", qty: qty("2"), rate: money("50") },
  ];

  it.each([
    ["unchanged", before, []],
    ["unchanged in another order", [before[1]!, before[0]!], []],
    ["qty changed", [{ ...before[0]!, qty: qty("4.001") }, before[1]!], ["lines.l-1.qty"]],
    ["rate changed", [before[0]!, { ...before[1]!, rate: money("50.00001") }], ["lines.l-2.rate"]],
    [
      "qty and rate changed",
      [{ id: "l-1", qty: qty("5"), rate: money("101") }, before[1]!],
      ["lines.l-1.qty", "lines.l-1.rate"],
    ],
    ["line removed", [before[0]!], ["lines.l-2"]],
    ["line added", [...before, { id: "l-3", qty: qty("1"), rate: money("1") }], ["lines.l-3"]],
  ])("%s", (_name, after, expected) => {
    expect(changedImmutableFields(before, after)).toEqual(expected);
  });

  it("compares DC lines, which carry no rate, by qty", () => {
    const dc = [{ id: "d-1", qty: qty("4") }];
    expect(changedImmutableFields(dc, [{ id: "d-1", qty: qty("4") }])).toEqual([]);
    expect(changedImmutableFields(dc, [{ id: "d-1", qty: qty("3") }])).toEqual(["lines.d-1.qty"]);
  });
});
