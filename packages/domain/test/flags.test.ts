import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import type { DesiredFlag, PoFlagSnapshot, Qty } from "../src/index.ts";
import { FLAG_SCOPES, FLAG_TYPES, detectFlags, diffFlags, fingerprint } from "../src/index.ts";
import { date, qty } from "./unwrap.ts";

type ItemInput = PoFlagSnapshot["items"][number];
type SrvLineInput = PoFlagSnapshot["srvLines"][number];

/** A PO item with nothing to flag: ord 10, nothing dispatched or invoiced, no manual quantity, no documents. */
function item(over: Partial<ItemInput> = {}): ItemInput {
  return {
    id: "item-1",
    ordQty: qty("10"),
    cancelled: false,
    dspQty: qty("0"),
    invoicedQty: qty("0"),
    manualDispatchedQty: qty("0"),
    manualSetAt: null,
    dcLines: [],
    invoiceLines: [],
    ...over,
  };
}

/** An SRV line matched to `item-1` with the same ordered quantity and no document numbers. */
function srvLine(over: Partial<SrvLineInput> = {}): SrvLineInput {
  return {
    id: "srv-line-1",
    poItemId: "item-1",
    ordQty: qty("10"),
    srvDate: date("2025-07-15"),
    challanNo: null,
    invoiceNo: null,
    resolvedDcId: null,
    resolvedInvoiceId: null,
    ...over,
  };
}

const detect = (items: ItemInput[], srvLines: SrvLineInput[] = []) => detectFlags({ poId: "po-1", items, srvLines });

const stored = (flag: DesiredFlag) => ({ fingerprint: fingerprint(flag) });

// INV-58: the v1 flag set is exactly these six (A-24); candidates such as RECEIVED_EXCEEDS_DISPATCHED are not in it.
describe("INV-58: FLAG_TYPES", () => {
  it("has exactly the six v1 types", () => {
    expect(FLAG_TYPES).toEqual([
      "QTY_MISMATCH",
      "DOC_NUMBER_CONFLICT",
      "OVER_DISPATCH",
      "OVER_INVOICE",
      "DOC_ON_CANCELLED_ITEM",
      "MANUAL_ADJUSTMENT_OVERLAP",
    ]);
  });

  it("has the four scopes a flag can be about", () => {
    expect(FLAG_SCOPES).toEqual(["srv_item", "po_item", "dc_item", "invoice_item"]);
  });

  it("flags nothing on a clean PO", () => {
    expect(detect([item()], [srvLine()])).toEqual([]);
  });
});

// INV-52: an SRV line whose ord_qty differs from its PO item's ord_qty by more than 0.001.
describe("INV-52: QTY_MISMATCH", () => {
  it("flags 100 vs 95", () => {
    expect(detect([item({ ordQty: qty("100") })], [srvLine({ ordQty: qty("95") })])).toEqual([
      {
        type: "QTY_MISMATCH",
        scopeType: "srv_item",
        scopeId: "srv-line-1",
        poId: "po-1",
        details: { field: "ord_qty", expected: "100", actual: "95", docIds: [] },
      },
    ]);
  });

  it.each([
    ["10", "10.002", true],
    ["10", "9.998", true],
    ["10", "10.001", false],
    ["10", "9.999", false],
    ["10", "10", false],
  ])("PO ord %s, SRV ord %s -> flagged %s", (poOrd, srvOrd, flagged) => {
    const flags = detect([item({ ordQty: qty(poOrd) })], [srvLine({ ordQty: qty(srvOrd) })]);
    expect(flags.map((f) => f.type)).toEqual(flagged ? ["QTY_MISMATCH"] : []);
  });

  // EC-12: an unmatched SRV line has no PO item to compare with.
  it("does not flag an unmatched SRV line", () => {
    expect(detect([item()], [srvLine({ poItemId: null, ordQty: qty("95") })])).toEqual([]);
  });
});

// INV-53: a cited challan/invoice number with no document of that number in the SRV date's FY (A-10).
describe("INV-53: DOC_NUMBER_CONFLICT", () => {
  // EC-03: DC 12 is dated 2025-03-28; an SRV dated 2025-04-03 cites it, so it resolved to no DC.
  it("flags an unresolved challan number (EC-03)", () => {
    const line = srvLine({ srvDate: date("2025-04-03"), challanNo: "12" });
    expect(detect([item()], [line])).toEqual([
      {
        type: "DOC_NUMBER_CONFLICT",
        scopeType: "srv_item",
        scopeId: "srv-line-1",
        poId: "po-1",
        details: { field: "challan_no", expected: null, actual: "12", docIds: [] },
      },
    ]);
  });

  it("flags each unresolved number on the line, trimmed", () => {
    const flags = detect([item()], [srvLine({ challanNo: "12", invoiceNo: " INV-7 " })]);
    expect(flags.map((f) => [f.type, f.details])).toEqual([
      ["DOC_NUMBER_CONFLICT", { field: "challan_no", expected: null, actual: "12", docIds: [] }],
      ["DOC_NUMBER_CONFLICT", { field: "invoice_no", expected: null, actual: "INV-7", docIds: [] }],
    ]);
  });

  it.each([
    ["resolved challan", { challanNo: "12", resolvedDcId: "dc-12" }],
    ["resolved invoice", { invoiceNo: "34", resolvedInvoiceId: "inv-34" }],
    ["no numbers", { challanNo: null, invoiceNo: null }],
    ["blank numbers", { challanNo: "  ", invoiceNo: "" }],
  ])("does not flag %s", (_, over) => {
    expect(detect([item()], [srvLine(over)])).toEqual([]);
  });

  // EC-12: a line that matched no PO item still cites a document number.
  it("flags an unmatched SRV line's unresolved number", () => {
    const flags = detect([item()], [srvLine({ poItemId: null, challanNo: "12" })]);
    expect(flags.map((f) => f.type)).toEqual(["DOC_NUMBER_CONFLICT"]);
  });
});

// INV-54: dsp_qty > ord_qty + 0.001 (A-7).
describe("INV-54: OVER_DISPATCH", () => {
  it("flags ord 10, dsp 10.002", () => {
    expect(detect([item({ dspQty: qty("10.002") })])).toEqual([
      {
        type: "OVER_DISPATCH",
        scopeType: "po_item",
        scopeId: "item-1",
        poId: "po-1",
        details: { field: "dsp_qty", expected: "10", actual: "10.002", docIds: [] },
      },
    ]);
  });

  it.each(["10.001", "10", "4"])("does not flag ord 10, dsp %s", (dsp) => {
    expect(detect([item({ dspQty: qty(dsp) })])).toEqual([]);
  });

  // EC-02: an amendment lowers ord below what is already dispatched.
  it("flags an amendment to ord 6 after DCs of 8 (EC-02)", () => {
    const flags = detect([item({ ordQty: qty("6"), dspQty: qty("8") })]);
    expect(flags.map((f) => [f.type, f.details])).toEqual([
      ["OVER_DISPATCH", { field: "dsp_qty", expected: "6", actual: "8", docIds: [] }],
    ]);
  });
});

// INV-55: sum(all invoice qty on the item) > ord_qty + 0.001 (A-7).
describe("INV-55: OVER_INVOICE", () => {
  it("flags ord 10, invoiced 10.002", () => {
    expect(detect([item({ invoicedQty: qty("10.002") })])).toEqual([
      {
        type: "OVER_INVOICE",
        scopeType: "po_item",
        scopeId: "item-1",
        poId: "po-1",
        details: { field: "invoiced_qty", expected: "10", actual: "10.002", docIds: [] },
      },
    ]);
  });

  it.each(["10.001", "10", "0"])("does not flag ord 10, invoiced %s", (invoiced) => {
    expect(detect([item({ invoicedQty: qty(invoiced) })])).toEqual([]);
  });
});

// INV-56: every DC or invoice line on a cancelled PO item (A-13).
describe("INV-56: DOC_ON_CANCELLED_ITEM", () => {
  it("flags each DC and invoice line on a cancelled item", () => {
    const cancelled = item({
      cancelled: true,
      dspQty: qty("3"),
      invoicedQty: qty("3"),
      dcLines: [{ id: "dc-line-1", dcId: "dc-1", createdAt: "2025-05-01T10:00:00.000Z" }],
      invoiceLines: [{ id: "inv-line-1", invoiceId: "inv-1" }],
    });
    expect(detect([cancelled])).toEqual([
      {
        type: "DOC_ON_CANCELLED_ITEM",
        scopeType: "dc_item",
        scopeId: "dc-line-1",
        poId: "po-1",
        details: { field: "status", expected: null, actual: "Cancelled", docIds: ["dc-1"] },
      },
      {
        type: "DOC_ON_CANCELLED_ITEM",
        scopeType: "invoice_item",
        scopeId: "inv-line-1",
        poId: "po-1",
        details: { field: "status", expected: null, actual: "Cancelled", docIds: ["inv-1"] },
      },
    ]);
  });

  it("does not flag a cancelled item with no documents", () => {
    expect(detect([item({ cancelled: true })])).toEqual([]);
  });

  it("does not flag documents on an active item", () => {
    const active = item({
      dspQty: qty("3"),
      dcLines: [{ id: "dc-line-1", dcId: "dc-1", createdAt: "2025-05-01T10:00:00.000Z" }],
      invoiceLines: [{ id: "inv-line-1", invoiceId: "inv-1" }],
    });
    expect(detect([active])).toEqual([]);
  });
});

// INV-57: manual qty > 0 and a DC line on the item created after the adjustment was last set (A-15).
describe("INV-57: MANUAL_ADJUSTMENT_OVERLAP", () => {
  const setAt = "2025-06-01T09:00:00.000Z";
  const dcLine = (id: string, dcId: string, createdAt: string) => ({ id, dcId, createdAt });

  it("flags DC lines created after the manual quantity was set, citing their DCs once each", () => {
    const flagged = item({
      dspQty: qty("8"),
      manualDispatchedQty: qty("4"),
      manualSetAt: setAt,
      dcLines: [
        dcLine("dc-line-0", "dc-0", "2025-05-31T23:59:59.999Z"),
        dcLine("dc-line-2", "dc-2", "2025-06-03T08:00:00.000Z"),
        dcLine("dc-line-1", "dc-1", "2025-06-02T08:00:00.000Z"),
        dcLine("dc-line-3", "dc-2", "2025-06-03T08:00:00.000Z"),
      ],
    });
    expect(detect([flagged])).toEqual([
      {
        type: "MANUAL_ADJUSTMENT_OVERLAP",
        scopeType: "po_item",
        scopeId: "item-1",
        poId: "po-1",
        details: { field: "manual_dispatched_qty", expected: null, actual: "4", docIds: ["dc-1", "dc-2"] },
      },
    ]);
  });

  it.each([
    ["the DC came before the manual quantity", "4", setAt, "2025-05-31T23:59:59.999Z"],
    ["the DC was created at the same instant", "4", setAt, setAt],
    ["the manual quantity is 0", "0", setAt, "2025-06-02T08:00:00.000Z"],
    ["the manual quantity was never set", "0", null, "2025-06-02T08:00:00.000Z"],
    ["a manual quantity has no set time", "4", null, "2025-06-02T08:00:00.000Z"],
  ])("does not flag when %s", (_, manual, manualSetAt, createdAt) => {
    const withManual = item({
      dspQty: qty("8"),
      manualDispatchedQty: qty(manual),
      manualSetAt,
      dcLines: [dcLine("dc-line-1", "dc-1", createdAt)],
    });
    expect(detect([withManual])).toEqual([]);
  });

  // EC-10: a PO-direct invoice is not a DC, so it never raises the overlap; dsp counts both and passes ord.
  it("does not flag a PO-direct invoice after the manual quantity (EC-10)", () => {
    const directInvoiced = item({
      ordQty: qty("6"),
      dspQty: qty("8"),
      invoicedQty: qty("4"),
      manualDispatchedQty: qty("4"),
      manualSetAt: setAt,
      invoiceLines: [{ id: "inv-line-1", invoiceId: "inv-1" }],
    });
    expect(detect([directInvoiced]).map((f) => f.type)).toEqual(["OVER_DISPATCH"]);
  });
});

describe("detectFlags", () => {
  it("lists flags item by item, then SRV line by SRV line", () => {
    const items = [
      item({ id: "item-1", ordQty: qty("5"), dspQty: qty("6"), invoicedQty: qty("6") }),
      item({ id: "item-2", ordQty: qty("5"), dspQty: qty("7") }),
    ];
    const srvLines = [
      srvLine({ id: "srv-line-1", poItemId: "item-2", ordQty: qty("4"), challanNo: "9" }),
      srvLine({ id: "srv-line-2", poItemId: "item-1", ordQty: qty("5") }),
    ];
    expect(detect(items, srvLines).map((f) => [f.type, f.scopeId])).toEqual([
      ["OVER_DISPATCH", "item-1"],
      ["OVER_INVOICE", "item-1"],
      ["OVER_DISPATCH", "item-2"],
      ["QTY_MISMATCH", "srv-line-1"],
      ["DOC_NUMBER_CONFLICT", "srv-line-1"],
    ]);
  });
});

const overDispatch = (dsp: string, scopeId = "item-1"): DesiredFlag => ({
  type: "OVER_DISPATCH",
  scopeType: "po_item",
  scopeId,
  poId: "po-1",
  details: { field: "dsp_qty", expected: "10", actual: dsp, docIds: [] },
});

// §6.9: fingerprint = type + scope + quantities + document ids.
describe("fingerprint", () => {
  it("lists type, scope, details and document ids", () => {
    expect(fingerprint(overDispatch("12"))).toBe('["OVER_DISPATCH","po_item","item-1","dsp_qty","10","12",[]]');
    const cancelled: DesiredFlag = {
      type: "DOC_ON_CANCELLED_ITEM",
      scopeType: "dc_item",
      scopeId: "dc-line-1",
      poId: "po-1",
      details: { field: "status", expected: null, actual: "Cancelled", docIds: ["dc-1"] },
    };
    expect(fingerprint(cancelled)).toBe(
      '["DOC_ON_CANCELLED_ITEM","dc_item","dc-line-1","status",null,"Cancelled",["dc-1"]]',
    );
  });

  it.each([
    ["the quantity", overDispatch("13")],
    ["the scope", overDispatch("12", "item-2")],
    ["the document ids", { ...overDispatch("12"), details: { ...overDispatch("12").details, docIds: ["dc-1"] } }],
    ["the type", { ...overDispatch("12"), type: "OVER_INVOICE" as const }],
  ])("changes with %s", (_, other) => {
    expect(fingerprint(other)).not.toBe(fingerprint(overDispatch("12")));
  });

  // A raw SRV number may contain any character; the encoding keeps fields apart.
  it("does not collide when a value contains a separator", () => {
    const conflict = (actual: string, scopeId: string): DesiredFlag => ({
      type: "DOC_NUMBER_CONFLICT",
      scopeType: "srv_item",
      scopeId,
      poId: "po-1",
      details: { field: "challan_no", expected: null, actual, docIds: [] },
    });
    expect(fingerprint(conflict("1|2", "a"))).not.toBe(fingerprint(conflict("2", "a|1")));
  });
});

// INV-59: re-detection never duplicates a flag, and nothing is ever closed by detection (EC-05).
describe("INV-59: diffFlags", () => {
  const fp12 = '["OVER_DISPATCH","po_item","item-1","dsp_qty","10","12",[]]';

  it("returns new flags only", () => {
    expect(diffFlags([overDispatch("12"), overDispatch("13")], [{ fingerprint: fp12 }])).toEqual([
      { ...overDispatch("13"), fingerprint: '["OVER_DISPATCH","po_item","item-1","dsp_qty","10","13",[]]' },
    ]);
  });

  it("returns a repeated desired flag once", () => {
    expect(diffFlags([overDispatch("12"), overDispatch("12")], [])).toEqual([
      { ...overDispatch("12"), fingerprint: fp12 },
    ]);
  });

  // EC-05: OVER_DISPATCH on ord 10 / dsp 12; the user deletes a DC of 2. The stored flag waits for the user.
  it("returns nothing to close when a condition disappears (EC-05)", () => {
    const before = detect([item({ dspQty: qty("12") })]);
    expect(diffFlags(before, [])).toEqual([{ ...overDispatch("12"), fingerprint: fp12 }]);
    const after = detect([item({ dspQty: qty("10") })]);
    expect(diffFlags(after, before.map(stored))).toEqual([]);
  });
});

// SPEC-03 §6: detection is deterministic, and detected flags stored once are never proposed again.
describe("properties", () => {
  const milli = fc.integer({ min: 0, max: 20_000 }).map((n) => n as Qty);
  const instant = fc.constantFrom("2025-06-01T09:00:00.000Z", "2025-06-02T09:00:00.000Z", "2025-06-03T09:00:00.000Z");
  const id = fc.constantFrom("a", "b", "c");
  const number = fc.option(fc.constantFrom("1", " 2 ", "", "x|y"));
  const poSnapshot = fc.record({
    poId: fc.constant("po-1"),
    items: fc.uniqueArray(
      fc.record({
        id,
        ordQty: milli,
        cancelled: fc.boolean(),
        dspQty: milli,
        invoicedQty: milli,
        manualDispatchedQty: milli,
        manualSetAt: fc.option(instant),
        dcLines: fc.array(fc.record({ id, dcId: id, createdAt: instant }), { maxLength: 3 }),
        invoiceLines: fc.array(fc.record({ id, invoiceId: id }), { maxLength: 3 }),
      }),
      { selector: (item) => item.id, maxLength: 3 },
    ),
    srvLines: fc.array(
      fc.record({
        id,
        poItemId: fc.option(id),
        ordQty: milli,
        srvDate: fc.constant(date("2025-07-15")),
        challanNo: number,
        invoiceNo: number,
        resolvedDcId: fc.option(id),
        resolvedInvoiceId: fc.option(id),
      }),
      { maxLength: 3 },
    ),
  });

  it("detects the same flags every time", () => {
    fc.assert(
      fc.property(poSnapshot, (s) => {
        expect(detectFlags(s)).toEqual(detectFlags(s));
      }),
    );
  });

  it("proposes nothing once the detected flags are stored", () => {
    fc.assert(
      fc.property(poSnapshot, (s) => {
        const desired = detectFlags(s);
        expect(diffFlags(desired, desired.map(stored))).toEqual([]);
      }),
    );
  });
});
