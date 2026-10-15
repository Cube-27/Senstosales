// SPEC-11 PR 4: the invoice create form's previews, over HTTP on the full app. From a DC: the DC's lines at the DC qty;
// from a PO: every item with no qty. Both show each item's uninvoiced quantity as information, not a cap (INV-05), and
// the settings' GST rates. Synthetic values only (C1).
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import { HEADER as DC_HEADER } from "./dc-fixtures.ts";
import { ID, json } from "./helpers.ts";
import { GEMC_PO, HEADER, ready, withDc } from "./invoice-fixtures.ts";

afterEach(closeApiApps);

/** The supplier details onboarding stored, which every preview carries. */
const SUPPLIER = {
  supplierName: DC_HEADER.supplierName,
  supplierAddress: DC_HEADER.supplierAddress,
  supplierGstin: DC_HEADER.supplierGstin,
  supplierContact: DC_HEADER.supplierContact,
};

/** Every invoice header field blank but the supplier's. */
const BLANK = { ...Object.fromEntries(Object.keys(HEADER).map((k) => [k, null])), ...SUPPLIER };

const info = (poItemNo: number, rate: string) => ({
  poItemNo,
  materialCode: `M-${poItemNo}`,
  description: "Example part",
  drawingNo: null,
  unit: "NOS",
  rate,
});

const hsn = { hsn: "0000", packets: null };

describe("GET /api/invoice/preview/po/:poId", () => {
  test("every item with no qty and its uninvoiced quantity, even when it is zero or negative (INV-05)", async () => {
    const { send, createDirect, storedPo, invoices } = await ready();
    await send("/api/settings", json("PUT", { cgstPct: "9", sgstPct: "9", preferences: {} }));
    // The settings' place of supply and HSN are the starting values (owner, 2026-10-15).
    const { id: _, ...supplier } = (await send("/api/supplier")).body;
    const invoiceDefaults = { placeOfSupply: "Example City", hsn: "0000" };
    expect((await send("/api/supplier", json("PUT", { ...supplier, invoiceDefaults }))).status).toBe(200);
    const { poId, item10, item20 } = await storedPo(GEMC_PO);
    await createDirect({ poId, number: "1", invoiceDate: "2025-04-03", lines: [{ poItemId: item10, qty: "12" }] });
    await createDirect({ poId, number: "2", invoiceDate: "2025-04-03", lines: [{ poItemId: item20, qty: "5" }] });
    const before = await invoices();

    const res = await send(`/api/invoice/preview/po/${poId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      po: { id: poId, poNumber: "4500002", isGemc: true },
      dc: null,
      header: { ...BLANK, buyersOrderDate: "2025-03-10", gemcNumber: "GEMC-77", placeOfSupply: "Example City" },
      cgstPct: "9",
      sgstPct: "9",
      lines: [
        { ...info(10, "719.27966"), poItemId: item10, dcItemId: null, qty: null, uninvoicedQty: "-2", ...hsn },
        { ...info(20, "100"), poItemId: item20, dcItemId: null, qty: null, uninvoicedQty: "0", ...hsn },
      ],
    });
    // A preview writes nothing.
    expect(await invoices()).toEqual(before);
  });

  test("an unknown PO is a 404", async () => {
    const { send } = await ready();
    const res = await send(`/api/invoice/preview/po/${ID}`);
    expect([res.status, res.body.code]).toEqual([404, "po-not-found"]);
  });
});

describe("GET /api/invoice/preview/dc/:dcId", () => {
  test("the DC's lines at the DC qty, its consignee as the buyer and its transport details", async () => {
    const { send, createDc, storedPo, createDirect, dcLines } = await ready();
    const { poId, item10, item20 } = await storedPo();
    await createDirect({ poId, number: "1", invoiceDate: "2025-04-03", lines: [{ poItemId: item20, qty: "1" }] });
    const created = await createDc({
      poId,
      number: "7",
      dcDate: "2025-04-02",
      consigneeName: "Example Unit",
      consigneeGstin: "TESTGSTIN0002",
      consigneeAddress: "2 Example Road",
      vehicleNo: "XX-00-0000",
      lrNo: "LR-1",
      transporter: "Example Carrier",
      remarks: "Example note",
      items: [
        { poItemId: item20, dspQty: "2", packets: 3 },
        { poItemId: item10, dspQty: "4" },
      ],
    });
    const [dcItem20, dcItem10] = (await dcLines()).map((l) => l.id);

    const res = await send(`/api/invoice/preview/dc/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      po: { id: poId, poNumber: "4500001", isGemc: false },
      dc: { id: created.body.id, number: "7", date: "2025-04-02", financialYear: "2025-26" },
      header: {
        ...BLANK,
        buyerName: "Example Unit",
        buyerGstin: "TESTGSTIN0002",
        buyerAddress: "2 Example Road",
        buyersOrderDate: "2025-03-10",
        vehicleNo: "XX-00-0000",
        lrNo: "LR-1",
        transporter: "Example Carrier",
        remarks: "Example note",
      },
      cgstPct: "6",
      sgstPct: "6",
      // In the DC's order, as the create stores them.
      lines: [
        // The DC line's packets; no HSN set in the settings.
        {
          ...info(20, "33.333"),
          poItemId: item20,
          dcItemId: dcItem20,
          qty: "2",
          uninvoicedQty: "4",
          hsn: null,
          packets: 3,
        },
        {
          ...info(10, "100"),
          poItemId: item10,
          dcItemId: dcItem10,
          qty: "4",
          uninvoicedQty: "10",
          hsn: null,
          packets: null,
        },
      ],
    });
  });

  test("a DC that has an invoice is a 409 (INV-28)", async () => {
    const { send, createInvoice, dcId, lines } = await withDc();
    expect((await createInvoice({ dcId, number: "1", invoiceDate: "2025-04-03", lines })).status).toBe(200);
    const res = await send(`/api/invoice/preview/dc/${dcId}`);
    expect([res.status, res.body.code, res.body["message"]]).toEqual([
      409,
      "dc-has-invoice",
      "DC 7 already has an invoice.",
    ]);
  });

  test("an unknown DC is a 404", async () => {
    const { send } = await ready();
    const res = await send(`/api/invoice/preview/dc/${ID}`);
    expect([res.status, res.body.code]).toEqual([404, "dc-not-found"]);
  });
});
