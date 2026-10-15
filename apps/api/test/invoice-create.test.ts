// SPEC-11 PR 3: the DC-sourced invoice, over HTTP on the full app. It carries exactly the DC's lines at the DC qty and
// PO rate, else 400 and nothing written (INV-29); one invoice per DC (INV-28); tax from the settings' GST rates copied
// onto the invoice (INV-41, INV-18). Each create is one batch with recompute, flags, SRV link re-resolution and an
// audit row (C4). Expected values are worked by hand from ARCHITECTURE §6.2, §6.5 and §6.10. Synthetic values only (C1).
import { dcItem, invoice, invoiceItem, srvItem } from "@senstosales/db";
import { afterEach, describe, expect, test } from "vite-plus/test";

import type { AppOverrides } from "./api-app.ts";
import { closeApiApps } from "./api-app.ts";
import type { Json } from "./dc-fixtures.ts";
import { heldBatches, line, PO as DC_PO, ready as dcReady } from "./dc-fixtures.ts";
import { ID, json } from "./helpers.ts";
import { NOW } from "./service-deps.ts";
import { srvPage } from "./srv-pages.ts";

afterEach(closeApiApps);

const rated = (poItemNo: number, ordQty: string, rateSource: string) => ({ ...line(poItemNo, ordQty), rateSource });

/** PO 4500001: item 10 of ord 10 at 100 and item 20 of ord 5 at 33.333. */
const PO = { ...DC_PO, items: [rated(10, "10", "100"), rated(20, "5", "33.333")] };

/** A GEMC PO: the GST-inclusive 848.75 is stored as the net 719.27966 (INV-16). */
const GEMC_PO = {
  ...PO,
  poNumber: "4500002",
  gemcNumber: "GEMC-77",
  items: [rated(10, "10", "848.75"), rated(20, "5", "118")],
};

/** Every invoice header field: a synthetic buyer snapshot, the rest blank. */
const HEADER = {
  buyerName: "Example Unit",
  buyerGstin: "TESTGSTIN0002",
  buyerAddress: "2 Example Road",
  buyerState: "Example State",
  buyerStateCode: "99",
  placeOfSupply: "Example City",
  buyersOrderDate: null,
  gemcNumber: null,
  gemcDate: null,
  paymentTerms: null,
  despatchDocNo: null,
  srvNo: null,
  srvDate: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  destination: null,
  termsOfDelivery: null,
  remarks: null,
  supplierName: "Example Supplier",
  supplierAddress: "1 Example Road",
  supplierGstin: "TESTGSTIN0001",
  supplierContact: "Example Contact",
};

/** The DC tests' app with this file's PO, and the invoice reads and writes. */
async function ready(overrides?: AppOverrides) {
  const r = await dcReady(overrides);
  const { app, send, createDc, items, auditOf } = r;
  const storedPo = (po: Json = PO) => r.storedPo(po);
  /** A stored DC with its line ids in the order given. */
  async function storedDc(poId: string, number: string, dcDate: string, lines: { poItemId: string; dspQty: string }[]) {
    const created = await createDc({ poId, number, dcDate, items: lines });
    expect(created.status).toBe(200);
    const rows = await app.db.query(app.db.build.select().from(dcItem).orderBy(dcItem.id));
    return { dcId: created.body.id, lineIds: rows.filter((row) => row.dcId === created.body.id).map((row) => row.id) };
  }
  const createInvoice = (body: Json) => send("/api/invoice", json("POST", { kind: "dc", ...HEADER, ...body }));
  const invoices = () => app.db.query(app.db.build.select().from(invoice).orderBy(invoice.id));
  const invoiceLines = () => app.db.query(app.db.build.select().from(invoiceItem).orderBy(invoiceItem.id));
  const invoiceAudit = () => auditOf("invoice.create");
  /** Everything an invoice create writes; a refused create leaves it as it was. */
  const written = async () => [await invoices(), await invoiceLines(), await invoiceAudit(), await items()];
  return { app, send, storedPo, storedDc, createInvoice, items, invoices, invoiceLines, invoiceAudit, written };
}

/** PO 4500001 with DC 7 of 4 on item 10 and 2 on item 20, in FY 2025-26. */
async function withDc(overrides?: AppOverrides) {
  const r = await ready(overrides);
  const { poId, item10, item20 } = await r.storedPo();
  const { dcId, lineIds } = await r.storedDc(poId, "7", "2025-04-02", [
    { poItemId: item10, dspQty: "4" },
    { poItemId: item20, dspQty: "2" },
  ]);
  const [dcItem10 = "", dcItem20 = ""] = lineIds;
  /** The lines of DC 7 as the form sends them: DC qty, PO rate. */
  const lines = [
    { dcItemId: dcItem10, qty: "4", rate: "100" },
    { dcItemId: dcItem20, qty: "2", rate: "33.333" },
  ];
  return { ...r, poId, item10, item20, dcId, dcItem10, dcItem20, lines };
}

describe("POST /api/invoice from a DC", () => {
  test("stores the DC's lines with tax, recomputes the PO and writes one audit row", async () => {
    const { createInvoice, poId, dcId, item10, item20, dcItem10, dcItem20, lines, items, invoiceLines, invoiceAudit } =
      await withDc();
    const res = await createInvoice({ dcId, number: "INV-1", invoiceDate: "2025-04-03", lines });
    expect(res.status).toBe(200);
    // 4 × 100 = 400.00, 6 % = 24.00; 2 × 33.333 = 66.666 -> 66.67, 6 % = 4.0002 -> 4.00 (2 dp, INV-41).
    expect(res.body).toEqual({
      ...HEADER,
      id: expect.any(String),
      kind: "dc",
      poId,
      dcId,
      number: "INV-1",
      invoiceDate: "2025-04-03",
      financialYear: "2025-26",
      cgstPct: "6",
      sgstPct: "6",
      taxable: "466.67",
      cgst: "28",
      sgst: "28",
      igst: "0",
      total: "522.67",
      version: 1,
      createdAt: NOW,
    });
    expect(
      (await invoiceLines()).map((l) => [
        l.invoiceId,
        l.poItemId,
        l.dcItemId,
        l.qty,
        l.rate,
        l.taxable,
        l.cgst,
        l.total,
      ]),
    ).toEqual([
      [res.body.id, item10, dcItem10, 4000, 10000000, 40000000, 2400000, 44800000],
      [res.body.id, item20, dcItem20, 2000, 3333300, 6667000, 400000, 7467000],
    ]);
    // A DC-sourced invoice leaves dispatch alone and lowers uninvoiced (INV-03, INV-05).
    expect((await items()).map((i) => [i.dspQty, i.uninvoicedQty])).toEqual([
      [4000, 6000],
      [2000, 3000],
    ]);
    expect(await invoiceAudit()).toEqual([
      expect.objectContaining({
        entityType: "invoice",
        entityId: res.body.id,
        before: null,
        after: {
          poId,
          dcId,
          number: "INV-1",
          invoiceDate: "2025-04-03",
          financialYear: "2025-26",
          cgstPct: 600000,
          sgstPct: 600000,
          total: 52267000,
          lines: [
            { dcItemId: dcItem10, qty: 4000, rate: 10000000 },
            { dcItemId: dcItem20, qty: 2000, rate: 3333300 },
          ],
        },
      }),
    ]);
  });

  test("tax on a GEMC PO at 9 % + 9 %: 3 × 719.27966 -> taxable 2157.83898, cgst 194.20551 (INV-41, INV-18)", async () => {
    const { send, storedPo, storedDc, createInvoice } = await ready();
    await send("/api/settings", json("PUT", { cgstPct: "9", sgstPct: "9", preferences: {} }));
    const { poId, item10 } = await storedPo(GEMC_PO);
    const { dcId, lineIds } = await storedDc(poId, "1", "2025-04-02", [{ poItemId: item10, dspQty: "3" }]);

    const res = await createInvoice({
      dcId,
      number: "1",
      invoiceDate: "2025-04-03",
      lines: [{ dcItemId: lineIds[0], qty: "3", rate: "719.27966" }],
    });
    expect(res.body).toMatchObject({
      cgstPct: "9",
      sgstPct: "9",
      taxable: "2157.83898",
      cgst: "194.20551",
      sgst: "194.20551",
      igst: "0",
      total: "2546.25",
    });
  });

  test("the GST rates and buyer are copied: a later settings change leaves a saved invoice as it was (A2-4)", async () => {
    const { send, storedDc, createInvoice, invoices, poId, item10, dcId, lines } = await withDc();
    const first = await createInvoice({ dcId, number: "1", invoiceDate: "2025-04-03", lines });
    await send("/api/settings", json("PUT", { cgstPct: "9", sgstPct: "9", preferences: {} }));
    const dc8 = await storedDc(poId, "8", "2025-04-04", [{ poItemId: item10, dspQty: "1" }]);

    const second = await createInvoice({
      ...HEADER,
      buyerName: "Another Unit",
      dcId: dc8.dcId,
      number: "2",
      invoiceDate: "2025-04-05",
      lines: [{ dcItemId: dc8.lineIds[0], qty: "1", rate: "100" }],
    });
    expect(second.body).toMatchObject({ buyerName: "Another Unit", cgstPct: "9", taxable: "100", cgst: "9" });
    expect((await invoices()).map((i) => [i.id, i.buyerName, i.cgstPct, i.sgstPct, i.cgst])).toEqual([
      [first.body.id, "Example Unit", 600000, 600000, 2800000],
      [second.body.id, "Another Unit", 900000, 900000, 900000],
    ]);
  });

  describe("lines other than the DC's at DC qty and PO rate are a 400 and write nothing (INV-29)", () => {
    type Ctx = Awaited<ReturnType<typeof withDc>> & { otherLine: string };
    test.each([
      ["another qty", (c: Ctx) => [{ ...c.lines[0], qty: "3" }, c.lines[1]], "dc-qty-mismatch", "body.lines.0.qty"],
      [
        "another rate",
        (c: Ctx) => [c.lines[0], { ...c.lines[1], rate: "33.33" }],
        "rate-mismatch",
        "body.lines.1.rate",
      ],
      ["a DC line left out", (c: Ctx) => [c.lines[0]], "dc-line-missing", "body.lines"],
      ["no lines", () => [], "dc-line-missing", "body.lines"],
      [
        "a line of another DC",
        (c: Ctx) => [...c.lines, { dcItemId: c.otherLine, qty: "1", rate: "100" }],
        "line-not-on-dc",
        "body.lines.2.dcItemId",
      ],
    ])("%s", async (_name, lines, code, path) => {
      const c = await withDc();
      const other = await c.storedDc(c.poId, "9", "2025-04-02", [{ poItemId: c.item10, dspQty: "1" }]);
      const ctx = { ...c, otherLine: other.lineIds[0] ?? "" };
      const before = await c.written();

      const res = await c.createInvoice({ dcId: c.dcId, number: "1", invoiceDate: "2025-04-03", lines: lines(ctx) });
      expect([res.status, res.body.code]).toEqual([400, code]);
      expect(res.body["details"]).toMatchObject({ fields: [{ path }] });
      expect(await c.written()).toEqual(before);
    });
  });

  test("a second invoice on the DC is a 409 and writes nothing (INV-28)", async () => {
    const { createInvoice, dcId, lines, written } = await withDc();
    expect((await createInvoice({ dcId, number: "1", invoiceDate: "2025-04-03", lines })).status).toBe(200);
    const before = await written();
    const res = await createInvoice({ dcId, number: "2", invoiceDate: "2025-04-03", lines });
    expect([res.status, res.body.code, res.body["message"]]).toEqual([
      409,
      "dc-has-invoice",
      "DC 7 already has an invoice.",
    ]);
    expect(await written()).toEqual(before);
  });

  describe("numbers restart each FY (INV-22)", () => {
    test("invoice 344 in 2024-25 and 2025-26 both save; a second 344 in 2025-26 is a 409 and writes nothing", async () => {
      const { storedPo, storedDc, createInvoice, written } = await ready();
      const { poId, item10 } = await storedPo();
      const invoice344 = async (dcNumber: string, date: string) => {
        const { dcId, lineIds } = await storedDc(poId, dcNumber, date, [{ poItemId: item10, dspQty: "1" }]);
        const lines = [{ dcItemId: lineIds[0], qty: "1", rate: "100" }];
        return createInvoice({ dcId, number: "344", invoiceDate: date, lines });
      };

      expect((await invoice344("1", "2025-03-31")).body).toMatchObject({ financialYear: "2024-25" });
      // DC 344 and invoice 344 in one FY both save: the numbers are independent.
      expect((await invoice344("344", "2025-04-01")).body).toMatchObject({ financialYear: "2025-26" });
      const before = await written();
      const res = await invoice344("3", "2026-03-31");
      expect([res.status, res.body.code, res.body["message"]]).toEqual([
        409,
        "invoice-number-taken",
        "Invoice 344 already exists in FY 2025-26.",
      ]);
      // Only the PO items changed: DC 3 was stored.
      expect((await written()).slice(0, 3)).toEqual(before.slice(0, 3));
    });

    test("surrounding spaces are trimmed; a blank number is a 400", async () => {
      const { createInvoice, dcId, lines, invoices } = await withDc();
      const blank = await createInvoice({ dcId, number: "  ", invoiceDate: "2025-04-03", lines });
      expect([blank.status, blank.body.code]).toEqual([400, "number-blank"]);
      const res = await createInvoice({ dcId, number: " 12 ", invoiceDate: "2025-04-03", lines });
      expect(res.body).toMatchObject({ number: "12" });
      expect((await invoices()).map((i) => i.number)).toEqual(["12"]);
    });
  });

  test("an unknown DC is a 404", async () => {
    const { createInvoice, invoices } = await ready();
    const res = await createInvoice({
      dcId: ID,
      number: "1",
      invoiceDate: "2025-04-03",
      lines: [{ dcItemId: "01J9Z8Q4S5T6V7W8X9Y0Z1A2B4", qty: "1", rate: "100" }],
    });
    expect([res.status, res.body.code]).toEqual([404, "dc-not-found"]);
    expect(await invoices()).toEqual([]);
  });

  test("a PO-direct invoice is a 400 until SPEC-11 PR 4 and writes nothing", async () => {
    const { send, poId, item10, invoices } = await withDc();
    const body = { ...HEADER, kind: "direct", poId, number: "1", invoiceDate: "2025-04-03" };
    const res = await send("/api/invoice", json("POST", { ...body, lines: [{ poItemId: item10, qty: "1" }] }));
    expect([res.status, res.body.code]).toEqual([400, "kind-unavailable"]);
    expect(await invoices()).toEqual([]);
  });

  test("SRV items that cited the invoice number in its FY are linked; others stay unlinked (INV-37)", async () => {
    const { app, createInvoice, dcId, lines } = await withDc();
    const upload = (date: string) =>
      app.client.request("srv.upload", {
        body: {
          files: [
            {
              name: "srv.html",
              html: srvPage("4500001", [{ srv: `S-${date}`, date, item: 10, code: "M-10", invoice: "INV-1" }]),
            },
          ],
        },
      });
    await upload("25/04/2025"); // FY 2025-26
    await upload("28/03/2025"); // FY 2024-25: a different invoice INV-1

    const res = await createInvoice({ dcId, number: "INV-1", invoiceDate: "2025-04-03", lines });
    expect(res.status).toBe(200);
    const linked = await app.db.query(
      app.db.build.select({ resolvedInvoiceId: srvItem.resolvedInvoiceId }).from(srvItem).orderBy(srvItem.id),
    );
    expect(linked).toEqual([{ resolvedInvoiceId: res.body.id }, { resolvedInvoiceId: null }]);
  });
});

describe("two creates built from the same read before either commits", () => {
  test("the same DC: one saves, the other is a 409 and writes nothing", async () => {
    const held = heldBatches();
    const { createInvoice, dcId, lines, invoices, invoiceAudit, items } = await withDc({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all([
      createInvoice({ dcId, number: "1", invoiceDate: "2025-04-03", lines }),
      createInvoice({ dcId, number: "2", invoiceDate: "2025-04-03", lines }),
    ]);
    expect(results.map((r) => [r.status, r.body.code]).sort()).toEqual([
      [200, undefined],
      [409, "dc-has-invoice"],
    ]);
    expect(await invoices()).toHaveLength(1);
    expect(await invoiceAudit()).toHaveLength(1);
    expect((await items()).map((i) => i.uninvoicedQty)).toEqual([6000, 3000]);
  });

  test("two DCs of one PO: both save and the items count both (no stale recompute)", async () => {
    const held = heldBatches();
    const { storedDc, createInvoice, poId, item10, dcId, lines, invoices, invoiceAudit, items } = await withDc({
      db: held.wrap,
    });
    const dc8 = await storedDc(poId, "8", "2025-04-02", [{ poItemId: item10, dspQty: "1" }]);
    held.hold(2);
    const results = await Promise.all([
      createInvoice({ dcId, number: "1", invoiceDate: "2025-04-03", lines }),
      createInvoice({
        dcId: dc8.dcId,
        number: "2",
        invoiceDate: "2025-04-03",
        lines: [{ dcItemId: dc8.lineIds[0], qty: "1", rate: "100" }],
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await invoices()).toHaveLength(2);
    expect(await invoiceAudit()).toHaveLength(2);
    expect((await items()).map((i) => i.uninvoicedQty)).toEqual([5000, 3000]);
  });
});
