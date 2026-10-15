// SPEC-11 PR 5: invoice header edit and delete, over HTTP on the full app. Lines and amounts never change after save
// (INV-33); a changed date moves the invoice to its FY and re-links the SRV items citing it (INV-25, EC-14); delete is
// refused while an SRV item links the invoice (INV-35); a stale version is a 409 (INV-95). Each write is one batch with
// recompute, flags, link re-resolution and an audit row (C4). Synthetic values only (C1).
import { srvItem } from "@senstosales/db";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import type { Json } from "./dc-fixtures.ts";
import { gatedBatch, heldBatches } from "./dc-fixtures.ts";
import { json } from "./helpers.ts";
import { HEADER, PO, withDc } from "./invoice-fixtures.ts";
import { id } from "./seed-rows.ts";
import { srvPage } from "./srv-pages.ts";

afterEach(closeApiApps);

type Ready = Awaited<ReturnType<typeof withDc>>;

/** PO 4500001 with DC 7 and invoice 31 of it, dated 2025-04-03: 4 × 100 and 2 × 33.333 at 6 % + 6 %. */
async function withInvoice31(overrides?: Parameters<typeof withDc>[0]) {
  const r = await withDc(overrides);
  const created = await r.createInvoice({ dcId: r.dcId, number: "31", invoiceDate: "2025-04-03", lines: r.lines });
  expect(created.status).toBe(200);
  return { ...r, inv31: created.body };
}

/** Uploads one SRV of `po` dated `date` (dd/mm/yyyy) whose item 10 cites invoice `invoice`. */
async function srvCiting(r: Ready, po: string, date: string, invoice: string) {
  const html = srvPage(po, [{ srv: `S-${po}-${date}`, date, item: 10, code: "M-10", invoice, rcd: "3" }]);
  const res = await r.app.client.request("srv.upload", { body: { files: [{ name: "srv.html", html }] } });
  expect(res.results.map((x) => x.status)).toEqual(["accepted"]);
}

const links = (r: Ready) =>
  r.app.db.query(
    r.app.db.build
      .select({ invoiceNo: srvItem.invoiceNo, resolvedInvoiceId: srvItem.resolvedInvoiceId })
      .from(srvItem)
      .orderBy(srvItem.id),
  );

/** The edit body of invoice 31 as stored, with `change` applied. */
const edit = (change: Json = {}) => ({ ...HEADER, number: "31", invoiceDate: "2025-04-03", version: 1, ...change });

const put = (r: Ready, invoiceId: string, body: Json) => r.send(`/api/invoice/${invoiceId}`, json("PUT", body));
const del = (r: Ready, invoiceId: string) => r.send(`/api/invoice/${invoiceId}`, json("DELETE", {}));

describe("PUT /api/invoice/:id", () => {
  test("changes header fields, bumps the version and writes one audit row; lines stay as saved (INV-33)", async () => {
    const r = await withInvoice31();
    const res = await put(
      r,
      r.inv31.id,
      // Lines in the body are not part of an edit: they are dropped, and the saved ones stay.
      edit({ vehicleNo: "VEH-2", buyerName: "Other Unit", lines: [{ dcItemId: r.dcItem10, qty: "9", rate: "1" }] }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      vehicleNo: "VEH-2",
      buyerName: "Other Unit",
      taxable: "466.67",
      total: "522.67",
      version: 2,
    });
    expect((await r.invoiceLines()).map((l) => [l.qty, l.rate])).toEqual([
      [4000, 10000000],
      [2000, 3333300],
    ]);
    expect(await r.auditOf("invoice.update")).toEqual([
      expect.objectContaining({
        entityType: "invoice",
        entityId: r.inv31.id,
        before: expect.objectContaining({ vehicleNo: null, buyerName: "Example Unit", version: 1 }),
        after: expect.objectContaining({ vehicleNo: "VEH-2", buyerName: "Other Unit", version: 2 }),
      }),
    ]);
  });

  test("the number is stored trimmed", async () => {
    const r = await withInvoice31();
    const res = await put(r, r.inv31.id, edit({ number: " 33 " }));
    expect(res.body).toMatchObject({ number: "33", financialYear: "2025-26" });
  });

  test("a stale version is a 409 and changes nothing (INV-95)", async () => {
    const r = await withInvoice31();
    expect((await put(r, r.inv31.id, edit({ vehicleNo: "VEH-2" }))).status).toBe(200);
    const before = await r.invoices();
    const res = await put(r, r.inv31.id, edit({ vehicleNo: "VEH-3" }));
    expect([res.status, res.body.code]).toEqual([409, "stale-version"]);
    expect(await r.invoices()).toEqual(before);
    expect(await r.auditOf("invoice.update")).toHaveLength(1);
  });

  test("an unknown invoice is a 404", async () => {
    const r = await withDc();
    const res = await put(r, id("ZZ"), edit());
    expect([res.status, res.body.code]).toEqual([404, "invoice-not-found"]);
  });

  test("a blank number is a 400", async () => {
    const r = await withInvoice31();
    const res = await put(r, r.inv31.id, edit({ number: " " }));
    expect([res.status, res.body.code]).toEqual([400, "number-blank"]);
  });

  test("re-dating invoice 31 into FY 2024-25 drops the SRV link and raises no flag (INV-25, EC-14, INV-53)", async () => {
    const r = await withInvoice31();
    await srvCiting(r, "4500001", "25/04/2025", "31");
    expect(await links(r)).toEqual([{ invoiceNo: "31", resolvedInvoiceId: r.inv31.id }]);

    const res = await put(r, r.inv31.id, edit({ invoiceDate: "2025-03-30" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ invoiceDate: "2025-03-30", financialYear: "2024-25" });
    expect(await links(r)).toEqual([{ invoiceNo: "31", resolvedInvoiceId: null }]);
    // A number with no invoice in the SRV's FY is not a conflict (A-10 revised).
    expect((await r.flags()).filter((f) => f.type === "DOC_NUMBER_CONFLICT")).toEqual([]);
  });

  test("an SRV of another PO that loses its link is flagged on that PO", async () => {
    const r = await withInvoice31();
    const other = await r.storedPo({ ...PO, poNumber: "4500002" });
    await srvCiting(r, "4500002", "25/04/2025", "31");
    expect(await links(r)).toEqual([{ invoiceNo: "31", resolvedInvoiceId: r.inv31.id }]);

    expect((await put(r, r.inv31.id, edit({ number: "32" }))).status).toBe(200);
    expect(await links(r)).toEqual([{ invoiceNo: "31", resolvedInvoiceId: null }]);
    const conflicts = (await r.flags()).filter((f) => f.type === "DOC_NUMBER_CONFLICT");
    expect(conflicts.map((f) => f.poId)).toEqual([other.poId]);
  });

  test("renumbering links the SRV items citing the new number in the invoice's FY (INV-37)", async () => {
    const r = await withInvoice31();
    await srvCiting(r, "4500001", "25/04/2025", "32");
    expect((await put(r, r.inv31.id, edit({ number: "32" }))).status).toBe(200);
    expect(await links(r)).toEqual([{ invoiceNo: "32", resolvedInvoiceId: r.inv31.id }]);
  });

  test("re-dating into a taken (number, FY) is a 409 naming it, and nothing changes (INV-25)", async () => {
    const r = await withInvoice31();
    const direct = await r.createDirect({
      poId: r.poId,
      number: "31",
      invoiceDate: "2025-03-20",
      lines: [{ poItemId: r.item10, qty: "1" }],
    });
    expect(direct.status).toBe(200);
    await srvCiting(r, "4500001", "25/04/2025", "31");
    const [before, linked] = [await r.invoices(), await links(r)];

    const res = await put(r, r.inv31.id, edit({ invoiceDate: "2025-03-30" }));
    expect([res.status, res.body.code, res.body["message"]]).toEqual([
      409,
      "invoice-number-taken",
      "Invoice 31 already exists in FY 2024-25.",
    ]);
    expect([await r.invoices(), await links(r), await r.auditOf("invoice.update")]).toEqual([before, linked, []]);
  });
});

describe("DELETE /api/invoice/:id", () => {
  test("removes a DC-sourced invoice and its lines, recomputes the PO and writes one audit row", async () => {
    const r = await withInvoice31();
    const res = await del(r, r.inv31.id);
    expect([res.status, res.body]).toEqual([200, { ok: true }]);
    expect([await r.invoices(), await r.invoiceLines()]).toEqual([[], []]);
    expect((await r.items()).map((i) => [i.dspQty, i.uninvoicedQty])).toEqual([
      [4000, 10000],
      [2000, 5000],
    ]);
    expect(await r.auditOf("invoice.delete")).toEqual([
      expect.objectContaining({
        entityType: "invoice",
        entityId: r.inv31.id,
        before: {
          poId: r.poId,
          dcId: r.dcId,
          number: "31",
          invoiceDate: "2025-04-03",
          financialYear: "2025-26",
          total: 52267000,
          version: 1,
          lines: [
            { poItemId: r.item10, dcItemId: r.dcItem10, qty: 4000, rate: 10000000 },
            { poItemId: r.item20, dcItemId: r.dcItem20, qty: 2000, rate: 3333300 },
          ],
        },
        after: null,
      }),
    ]);
    // The DC has no invoice again, so it can be invoiced (INV-28).
    const again = await r.createInvoice({ dcId: r.dcId, number: "31", invoiceDate: "2025-04-03", lines: r.lines });
    expect(again.status).toBe(200);
  });

  test("removing a PO-direct invoice gives its quantity back to dispatch (INV-03)", async () => {
    const r = await withDc();
    const direct = await r.createDirect({
      poId: r.poId,
      number: "40",
      invoiceDate: "2025-04-10",
      lines: [{ poItemId: r.item10, qty: "3" }],
    });
    expect((await r.items()).map((i) => i.dspQty)).toEqual([7000, 2000]);
    expect((await del(r, direct.body.id)).status).toBe(200);
    expect((await r.items()).map((i) => [i.dspQty, i.uninvoicedQty])).toEqual([
      [4000, 10000],
      [2000, 5000],
    ]);
  });

  test("an invoice an SRV item links is a 409 with the reason, and nothing changes (INV-35)", async () => {
    const r = await withInvoice31();
    await srvCiting(r, "4500001", "25/04/2025", "31");
    const before = [await r.invoices(), await r.invoiceLines(), await r.items()];
    const res = await del(r, r.inv31.id);
    expect([res.status, res.body.code, res.body["details"]]).toEqual([
      409,
      "delete-blocked",
      { reason: "invoice-linked-srv" },
    ]);
    expect([await r.invoices(), await r.invoiceLines(), await r.items()]).toEqual(before);
    expect(await r.auditOf("invoice.delete")).toEqual([]);
  });

  test("an unknown invoice is a 404", async () => {
    const r = await withDc();
    const res = await del(r, id("ZZ"));
    expect([res.status, res.body.code]).toEqual([404, "invoice-not-found"]);
  });
});

describe("two writes built from the same read before either commits", () => {
  test("two edits of version 1: one saves, the other is a 409 and writes nothing", async () => {
    const held = heldBatches();
    const r = await withInvoice31({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all([
      put(r, r.inv31.id, edit({ vehicleNo: "VEH-A" })),
      put(r, r.inv31.id, edit({ vehicleNo: "VEH-B" })),
    ]);
    expect(results.map((x) => [x.status, x.body.code]).sort()).toEqual([
      [200, undefined],
      [409, "stale-version"],
    ]);
    expect((await r.invoices()).map((d) => d.version)).toEqual([2]);
    expect(await r.auditOf("invoice.update")).toHaveLength(1);
  });

  test("two edits moving two invoices to one (number, FY): one saves, the other is a 409 and writes nothing", async () => {
    const held = heldBatches();
    const r = await withInvoice31({ db: held.wrap });
    const direct = await r.createDirect({
      poId: r.poId,
      number: "40",
      invoiceDate: "2025-04-10",
      lines: [{ poItemId: r.item10, qty: "1" }],
    });
    held.hold(2);
    const results = await Promise.all([
      put(r, r.inv31.id, edit({ number: "50" })),
      put(r, direct.body.id, edit({ number: "50", invoiceDate: "2025-04-10" })),
    ]);
    expect(results.map((x) => [x.status, x.body.code]).sort()).toEqual([
      [200, undefined],
      [409, "invoice-number-taken"],
    ]);
    // The one that saved is 50; the other kept its number.
    const saved = results.findIndex((x) => x.status === 200);
    const numbers = (await r.invoices()).map((i) => i.number).sort();
    expect(numbers).toEqual(saved === 0 ? ["40", "50"] : ["31", "50"]);
    expect(await r.auditOf("invoice.update")).toHaveLength(1);
  });

  test("two deletes: one removes the invoice, the other is a 404 and writes nothing", async () => {
    const held = heldBatches();
    const r = await withInvoice31({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all([del(r, r.inv31.id), del(r, r.inv31.id)]);
    expect(results.map((x) => [x.status, x.body.code]).sort()).toEqual([
      [200, undefined],
      [404, "invoice-not-found"],
    ]);
    expect(await r.auditOf("invoice.delete")).toHaveLength(1);
  });

  test("an edit built before a delete commits: the delete removes the invoice, the edit is a 404 and writes nothing", async () => {
    const gate = gatedBatch();
    const r = await withInvoice31({ db: gate.wrap });
    const held = gate.close();
    const edited = put(r, r.inv31.id, edit({ vehicleNo: "VEH-A" }));
    await held.reached;
    expect((await del(r, r.inv31.id)).status).toBe(200);
    held.open();
    const res = await edited;
    expect([res.status, res.body.code]).toEqual([404, "invoice-not-found"]);
    expect([await r.invoices(), await r.auditOf("invoice.update")]).toEqual([[], []]);
  });

  test("an SRV that links the invoice after the delete read it: the delete is a 409 and the link stays", async () => {
    const gate = gatedBatch();
    const r = await withInvoice31({ db: gate.wrap });
    const held = gate.close();
    const pending = del(r, r.inv31.id);
    await held.reached;
    await srvCiting(r, "4500001", "25/04/2025", "31");
    held.open();
    const res = await pending;
    expect([res.status, res.body.code, res.body["details"]]).toEqual([
      409,
      "delete-blocked",
      { reason: "invoice-linked-srv" },
    ]);
    expect(await r.invoices()).toHaveLength(1);
    expect(await links(r)).toEqual([{ invoiceNo: "31", resolvedInvoiceId: r.inv31.id }]);
    expect(await r.auditOf("invoice.delete")).toEqual([]);
  });
});
