// SPEC-11 PR 6: the ARCHITECTURE §14.1 DC and invoice flows of SPEC-11 §6, end to end on one synthetic dataset. Every
// step goes through the typed web client as the screens call it (create form data, then create; previews, then
// invoice), so requests and responses are checked against the shared schemas too. Expected values are worked by hand
// from ARCHITECTURE §6.2-§6.10. Synthetic values only (C1).
import type { Instant } from "@senstosales/db";
import type { RouteInput } from "@senstosales/schemas";
import { ApiError, zGstPct, zMoney, zQty } from "@senstosales/schemas";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps, onboardedApp } from "../api-app.ts";
import { poPage } from "../po-pages.ts";
import { d as day } from "../seed-rows.ts";
import { srvPage } from "../srv-pages.ts";

afterEach(closeApiApps);

type Client = Awaited<ReturnType<typeof onboardedApp>>["client"];

const qty = (s: string) => zQty.decode(s);
const text = (v: Parameters<typeof zQty.encode>[0]) => zQty.encode(v);
const money = (v: Parameters<typeof zMoney.encode>[0]) => zMoney.encode(v);

/** A clock one second later on every read, so each write is after the one before it. */
function tickingClock() {
  let seconds = 0;
  const start = Date.UTC(2025, 5, 1, 5, 30);
  return {
    today: () => day("2025-06-01"),
    now: () => new Date(start + 1000 * seconds++).toISOString() as Instant,
  };
}

/**
 * The dataset every flow starts from, entered as a user would: onboarding, GST 9 % + 9 %, and two uploaded POs.
 * - PO 4500001: item 10 (ord 10 at 100), item 20 (ord 5 at 50), item 30 (ord 4 at 100); amendment 1 leaves item 30
 *   out, which cancels it (INV-48).
 * - PO 4500002, GEMC: item 10 (ord 10 at 848.75 GST-inclusive, net 719.27966) and item 20 (ord 5 at 118, net 100).
 */
async function dataset() {
  const { client } = await onboardedApp({ clock: tickingClock() });
  const settings = await client.request("settings.get");
  const nine = zGstPct.decode("9");
  await client.request("settings.update", { body: { ...settings, cgstPct: nine, sgstPct: nine } });

  const uploadPo = (html: string) => upload(client, "po.upload", html);
  const items = [
    { no: 10, ord: "10.000", rate: "100.00" },
    { no: 20, ord: "5.000", rate: "50.00" },
    { no: 30, ord: "4.000", rate: "100.00" },
  ];
  await uploadPo(poPage({ number: "4500001", date: "10/03/2025", items }));
  await uploadPo(poPage({ number: "4500001", date: "11/03/2025", amend: 1, items: items.slice(0, 2) }));
  await uploadPo(
    poPage({
      number: "4500002",
      date: "12/03/2025",
      remarks: "Supply under GEMC- 5116",
      items: [
        { no: 10, ord: "10.000", rate: "848.75" },
        { no: 20, ord: "5.000", rate: "118.00" },
      ],
    }),
  );

  const { items: pos } = await client.request("po.list", { query: { pageSize: 100 } });
  const stored = async (poNumber: string) => {
    const id = pos.find((p) => p.poNumber === poNumber)!.id;
    const detail = await client.request("po.detail", { params: { id } });
    const item = (no: number) => detail.items.find((i) => i.poItemNo === no)!.id;
    return { id, item };
  };
  return { client, ...flows(client), po: await stored("4500001"), gemc: await stored("4500002") };
}

type Lines = readonly (readonly [poItemId: string, qty: string])[];
type DcLine = Extract<RouteInput<"invoice.create">["body"], { kind: "dc" }>["lines"][number];

/** Uploads one BHEL page and checks it was accepted. */
async function upload(client: Client, route: "po.upload" | "srv.upload", html: string) {
  const res = await client.request(route, { body: { files: [{ name: "page.html", html }] } });
  expect(res.results.map((r) => r.status)).toEqual(["accepted"]);
}

/** The screens' calls, each from the data the screen loads first. */
function flows(client: Client) {
  /** The create-DC form: its defaults from the PO, the lines typed in, GC left blank (INV-26). */
  async function createDc(poId: string, number: string, dcDate: string, lines: Lines) {
    const form = await client.request("dc.dispatchable", { params: { poId } });
    const items = lines.map(([poItemId, q]) => ({ poItemId, dspQty: qty(q) }));
    const body = { ...form.defaults, poId, number, dcDate: day(dcDate), gcNumber: null, gcDate: null, items };
    return client.request("dc.create", { body });
  }

  /** Create Invoice from a DC: the preview's header and lines (DC qty, PO rate), unless `change` alters a line. */
  async function invoiceDc(dcId: string, number: string, invoiceDate: string, change = (l: DcLine[]) => l) {
    const preview = await client.request("invoice.previewDc", { params: { dcId } });
    const lines = preview.lines.map((l) => ({ dcItemId: l.dcItemId!, qty: l.qty!, rate: l.rate }));
    const body = { ...preview.header, kind: "dc" as const, dcId, number, invoiceDate: day(invoiceDate) };
    return client.request("invoice.create", { body: { ...body, lines: change(lines) } });
  }

  /** Create Invoice from a PO: the preview's header and the quantities typed in. */
  async function invoicePo(poId: string, number: string, invoiceDate: string, lines: Lines) {
    const preview = await client.request("invoice.previewPo", { params: { poId } });
    const body = { ...preview.header, kind: "direct" as const, poId, number, invoiceDate: day(invoiceDate) };
    return client.request("invoice.create", {
      body: { ...body, lines: lines.map(([poItemId, q]) => ({ poItemId, qty: qty(q) })) },
    });
  }

  /** Edit DC: the stored header with `change` applied, at the stored version. */
  async function editDc(id: string, change: Partial<RouteInput<"dc.update">["body"]>) {
    const { dc } = await client.request("dc.detail", { params: { id } });
    const { id: _id, poId: _po, financialYear: _fy, createdAt: _at, ...body } = dc;
    return client.request("dc.update", { params: { id }, body: { ...body, ...change } });
  }

  /** An SRV of PO 4500001 receiving 4 of item 10, citing `refs`; returns its id. */
  async function uploadSrv(srv: string, date: string, refs: { challan?: string; invoice?: string }) {
    await upload(
      client,
      "srv.upload",
      srvPage("4500001", [{ srv, date, item: 10, code: "SYN-10", rcd: "4.000", ...refs }]),
    );
    const { items } = await client.request("srv.list", { query: { pageSize: 100 } });
    return items.find((s) => s.srvNumber === srv)!.id;
  }

  /** Each item as `[no, dsp, balance, uninvoiced, status]`. */
  async function itemsOf(poId: string) {
    const { items } = await client.request("po.detail", { params: { id: poId } });
    return items.map((i) => [i.poItemNo, text(i.dspQty), text(i.balanceQty), text(i.uninvoicedQty), i.status]);
  }

  /** The PO's flags as `[type, scopeType, scopeId, details]`, oldest first. */
  async function flagsOf(poId: string) {
    const { items } = await client.request("flags.list", { query: { poId, pageSize: 100, sort: "openedAt" } });
    return items.map((f) => [f.type, f.scopeType, f.scopeId, f.details]);
  }

  /** Everything a refused write must leave as it was. */
  const everything = async () => [
    await client.request("po.list", { query: { pageSize: 100 } }),
    await client.request("dc.list", { query: { pageSize: 100 } }),
    await client.request("invoice.list", { query: { pageSize: 100 } }),
    await client.request("flags.list", { query: { pageSize: 100 } }),
    await client.request("audit.list", { query: { pageSize: 100 } }),
  ];

  return { createDc, invoiceDc, invoicePo, editDc, uploadSrv, itemsOf, flagsOf, everything };
}

/** An SRV citing challan 7 with no DC 7 in its FY (INV-53). */
const CHALLAN_7_UNMATCHED = { field: "challan_no", expected: null, actual: "7", docIds: [] };

/** A refused call's status, code and details. */
async function refused(call: Promise<unknown>) {
  const err = await call.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  const { status, body } = err as ApiError;
  return { status, code: body.code, message: body.message, details: body.details };
}

describe("DC flows", () => {
  test("a DC over pending saves and raises OVER_DISPATCH; qty 0 is a 400 and writes nothing (C6, INV-32, INV-54)", async () => {
    const d = await dataset();
    const item10 = d.po.item(10);
    await d.createDc(d.po.id, "1", "2025-04-05", [[item10, "8"]]);
    const form = await d.client.request("dc.dispatchable", { params: { poId: d.po.id } });
    expect(form.items.map((i) => [i.poItemNo, text(i.balanceQty)])).toEqual([
      [10, "2"],
      [20, "5"],
      [30, "0"],
    ]);

    const over = await d.createDc(d.po.id, "2", "2025-04-06", [[item10, "4"]]);
    expect(over).toMatchObject({ number: "2", financialYear: "2025-26" });
    expect((await d.itemsOf(d.po.id))[0]).toEqual([10, "12", "0", "10", "Delivered"]);
    expect(await d.flagsOf(d.po.id)).toEqual([
      ["OVER_DISPATCH", "po_item", item10, { field: "dsp_qty", expected: "10", actual: "12", docIds: [] }],
    ]);

    const before = await d.everything();
    expect(await refused(d.createDc(d.po.id, "3", "2025-04-07", [[item10, "0"]]))).toMatchObject({
      status: 400,
      code: "qty-not-positive",
    });
    expect(await d.everything()).toEqual(before);
  });

  test("a DC on a cancelled item saves and raises DOC_ON_CANCELLED_ITEM on its line (INV-56)", async () => {
    const d = await dataset();
    expect((await d.itemsOf(d.po.id))[2]).toEqual([30, "0", "0", "4", "Cancelled"]);

    const created = await d.createDc(d.po.id, "5", "2025-04-05", [[d.po.item(30), "1"]]);
    const detail = await d.client.request("dc.detail", { params: { id: created.id } });
    const lineId = detail.items[0]!.id;
    const flag = { field: "status", expected: null, actual: "Cancelled", docIds: [created.id] };
    expect(await d.flagsOf(d.po.id)).toEqual([["DOC_ON_CANCELLED_ITEM", "dc_item", lineId, flag]]);
    expect(detail.flags.map((f) => [f.type, f.scopeId])).toEqual([["DOC_ON_CANCELLED_ITEM", lineId]]);

    // Invoicing that DC flags its invoice line too.
    const invoice = await d.invoiceDc(created.id, "5", "2025-04-06");
    const invoiceLine = (await d.client.request("invoice.detail", { params: { id: invoice.id } })).items[0]!.id;
    expect(await d.flagsOf(d.po.id)).toEqual([
      ["DOC_ON_CANCELLED_ITEM", "dc_item", lineId, flag],
      ["DOC_ON_CANCELLED_ITEM", "invoice_item", invoiceLine, { ...flag, docIds: [invoice.id] }],
    ]);
  });

  test("a manual dispatched qty then a DC raises MANUAL_ADJUSTMENT_OVERLAP; a PO-direct invoice does not (INV-57, EC-10)", async () => {
    const d = await dataset();
    const [item10, item20] = [d.po.item(10), d.po.item(20)];
    for (const itemId of [item10, item20]) {
      await d.client.request("po.setManualDispatched", {
        params: { id: d.po.id, itemId },
        body: { qty: qty("2") },
      });
    }

    const dc = await d.createDc(d.po.id, "4", "2025-04-05", [[item10, "3"]]);
    await d.invoicePo(d.po.id, "INV-4", "2025-04-06", [[item20, "1"]]);

    expect((await d.itemsOf(d.po.id)).slice(0, 2)).toEqual([
      [10, "5", "5", "10", "Pending"],
      [20, "3", "2", "4", "Pending"],
    ]);
    expect(await d.flagsOf(d.po.id)).toEqual([
      [
        "MANUAL_ADJUSTMENT_OVERLAP",
        "po_item",
        item10,
        { field: "manual_dispatched_qty", expected: null, actual: "2", docIds: [dc.id] },
      ],
    ]);
  });

  describe("numbers restart each FY (INV-22, INV-24)", () => {
    test("DC 100 in 2024-25 and 2025-26 both save; a second DC 100 in 2025-26 is a 409 and writes nothing", async () => {
      const d = await dataset();
      const lines: Lines = [[d.po.item(10), "1"]];
      const older = await d.createDc(d.po.id, "100", "2025-03-20", lines);
      const newer = await d.createDc(d.po.id, "100", "2025-04-20", lines);
      expect([older.financialYear, newer.financialYear]).toEqual(["2024-25", "2025-26"]);

      const before = await d.everything();
      expect(await refused(d.createDc(d.gemc.id, "100", "2025-05-01", [[d.gemc.item(10), "1"]]))).toMatchObject({
        status: 409,
        code: "dc-number-taken",
        message: "DC 100 already exists in FY 2025-26.",
      });
      expect(await d.everything()).toEqual(before);
    });

    test("DC 344 and invoice 344 in one FY both save", async () => {
      const d = await dataset();
      const dc = await d.createDc(d.po.id, "344", "2025-04-02", [[d.po.item(10), "2"]]);
      const invoice = await d.invoiceDc(dc.id, "344", "2025-04-03");
      expect([dc.number, dc.financialYear, invoice.number, invoice.financialYear]).toEqual([
        "344",
        "2025-26",
        "344",
        "2025-26",
      ]);
    });
  });

  test("a DC whose (number, FY) an earlier SRV cited links that SRV item (INV-37)", async () => {
    const d = await dataset();
    const srvId = await d.uploadSrv("S-1", "25/04/2025", { challan: "7" });
    expect((await d.flagsOf(d.po.id)).map((f) => [f[0], f[3]])).toEqual([["DOC_NUMBER_CONFLICT", CHALLAN_7_UNMATCHED]]);

    const dc = await d.createDc(d.po.id, "7", "2025-04-02", [[d.po.item(10), "4"]]);
    const srv = await d.client.request("srv.detail", { params: { id: srvId } });
    expect(srv.items.map((i) => [i.challanNo, i.resolvedDcId])).toEqual([["7", dc.id]]);
    const detail = await d.client.request("dc.detail", { params: { id: dc.id } });
    expect(detail.srvs.map((s) => s.id)).toEqual([srvId]);
  });

  test("re-dating DC 7 into 2024-25 drops its SRV link; re-dating another DC 7 onto it is a 409 (INV-25, EC-14)", async () => {
    const d = await dataset();
    const item10 = d.po.item(10);
    const dc7 = await d.createDc(d.po.id, "7", "2025-04-02", [[item10, "4"]]);
    const srvId = await d.uploadSrv("S-1", "25/04/2025", { challan: "7" });
    const links = async () =>
      (await d.client.request("srv.detail", { params: { id: srvId } })).items.map((i) => i.resolvedDcId);
    expect(await links()).toEqual([dc7.id]);
    expect(await d.flagsOf(d.po.id)).toEqual([]);

    const moved = await d.editDc(dc7.id, { dcDate: day("2025-03-30"), gcDate: null });
    expect(moved).toMatchObject({ dcDate: "2025-03-30", financialYear: "2024-25", gcDate: "2025-03-30", version: 2 });
    expect(await links()).toEqual([null]);
    expect((await d.flagsOf(d.po.id)).map((f) => [f[0], f[1], f[3]])).toEqual([
      ["DOC_NUMBER_CONFLICT", "srv_item", CHALLAN_7_UNMATCHED],
    ]);

    // A new DC 7 in 2025-26 takes the free key, and the SRV links to it.
    const again = await d.createDc(d.po.id, "7", "2025-04-05", [[item10, "1"]]);
    expect(await links()).toEqual([again.id]);

    const before = await d.everything();
    expect(await refused(d.editDc(again.id, { dcDate: day("2025-03-31"), gcDate: null }))).toMatchObject({
      status: 409,
      code: "dc-number-taken",
      message: "DC 7 already exists in FY 2024-25.",
    });
    expect([await d.everything(), await links()]).toEqual([before, [again.id]]);
  });
});

describe("invoice flows", () => {
  test("another qty or rate on a DC-sourced invoice is a 400 and writes nothing; a second invoice is a 409 (INV-28, INV-29)", async () => {
    const d = await dataset();
    const dc = await d.createDc(d.po.id, "7", "2025-04-02", [
      [d.po.item(10), "4"],
      [d.po.item(20), "2"],
    ]);
    const before = await d.everything();

    const otherQty = d.invoiceDc(dc.id, "31", "2025-04-03", ([a, b]) => [{ ...a!, qty: qty("3") }, b!]);
    expect(await refused(otherQty)).toMatchObject({
      status: 400,
      code: "dc-qty-mismatch",
      details: { fields: [expect.objectContaining({ path: "body.lines.0.qty" })] },
    });
    const otherRate = d.invoiceDc(dc.id, "31", "2025-04-03", ([a, b]) => [a!, { ...b!, rate: zMoney.decode("49") }]);
    expect(await refused(otherRate)).toMatchObject({
      status: 400,
      code: "rate-mismatch",
      details: { fields: [expect.objectContaining({ path: "body.lines.1.rate" })] },
    });
    expect(await d.everything()).toEqual(before);

    const invoice = await d.invoiceDc(dc.id, "31", "2025-04-03");
    expect([money(invoice.taxable), money(invoice.total)]).toEqual(["500", "590"]);
    const invoiced = await d.everything();
    expect(await refused(d.invoiceDc(dc.id, "32", "2025-04-04"))).toMatchObject({
      status: 409,
      code: "dc-has-invoice",
      message: "DC 7 already has an invoice.",
    });
    expect(await d.everything()).toEqual(invoiced);
  });

  test("DC 10 and a PO-direct invoice of 10 on ord 10: dsp 20 and OVER_DISPATCH; OVER_INVOICE once the DC is invoiced too (EC-13, INV-55)", async () => {
    const d = await dataset();
    const item10 = d.po.item(10);
    const dc = await d.createDc(d.po.id, "1", "2025-04-02", [[item10, "10"]]);
    const direct = await d.invoicePo(d.po.id, "2", "2025-04-03", [[item10, "10"]]);

    expect((await d.itemsOf(d.po.id))[0]).toEqual([10, "20", "0", "0", "Delivered"]);
    const overDispatch = { field: "dsp_qty", expected: "10", actual: "20", docIds: [] };
    expect(await d.flagsOf(d.po.id)).toEqual([["OVER_DISPATCH", "po_item", item10, overDispatch]]);

    await d.invoiceDc(dc.id, "3", "2025-04-04");
    expect((await d.itemsOf(d.po.id))[0]).toEqual([10, "20", "0", "-10", "Delivered"]);
    expect(await d.flagsOf(d.po.id)).toEqual([
      ["OVER_DISPATCH", "po_item", item10, overDispatch],
      ["OVER_INVOICE", "po_item", item10, { field: "invoiced_qty", expected: "10", actual: "20", docIds: [] }],
    ]);
    // The preview shows the negative uninvoiced as information; it caps nothing (INV-05).
    const preview = await d.client.request("invoice.previewPo", { params: { poId: d.po.id } });
    expect(preview.lines.map((l) => [l.poItemNo, l.qty, text(l.uninvoicedQty)])).toEqual([
      [10, null, "-10"],
      [20, null, "5"],
      [30, null, "4"],
    ]);
    expect(direct.dcId).toBeNull();
  });

  test("tax on the GEMC PO at 9 % + 9 %: 3 × 719.27966 -> taxable 2157.83898, cgst 194.20551; header = sum of lines (INV-41, INV-18)", async () => {
    const d = await dataset();
    const dc = await d.createDc(d.gemc.id, "1", "2025-04-02", [
      [d.gemc.item(10), "3"],
      [d.gemc.item(20), "2"],
    ]);
    const invoice = await d.invoiceDc(dc.id, "1", "2025-04-03");
    const detail = await d.client.request("invoice.detail", { params: { id: invoice.id } });
    expect(
      detail.items.map((l) => [money(l.rate), money(l.taxable), money(l.cgst), money(l.sgst), money(l.total)]),
    ).toEqual([
      ["719.27966", "2157.83898", "194.20551", "194.20551", "2546.25"],
      ["100", "200", "18", "18", "236"],
    ]);
    const { cgstPct, sgstPct, taxable, cgst, sgst, igst, total } = detail.invoice;
    expect([cgstPct, sgstPct].map((p) => zGstPct.encode(p))).toEqual(["9", "9"]);
    expect([taxable, cgst, sgst, igst, total].map(money)).toEqual([
      "2357.83898",
      "212.20551",
      "212.20551",
      "0",
      "2782.25",
    ]);
  });
});

test("one PO through every document and back: links block deletes with a reason until they are gone (INV-35, INV-37)", async () => {
  const d = await dataset();
  const [item10, item20] = [d.po.item(10), d.po.item(20)];
  const start = await d.itemsOf(d.po.id);
  expect(start).toEqual([
    [10, "0", "10", "10", "Pending"],
    [20, "0", "5", "5", "Pending"],
    [30, "0", "0", "4", "Cancelled"],
  ]);

  const dc = await d.createDc(d.po.id, "7", "2025-04-02", [
    [item10, "4"],
    [item20, "2"],
  ]);
  const invoice = await d.invoiceDc(dc.id, "31", "2025-04-03");
  const srvId = await d.uploadSrv("S-1", "25/04/2025", { challan: "7", invoice: "31" });
  const srv = await d.client.request("srv.detail", { params: { id: srvId } });
  expect(srv.items.map((i) => [i.resolvedDcId, i.resolvedInvoiceId])).toEqual([[dc.id, invoice.id]]);
  expect(await d.itemsOf(d.po.id)).toEqual([
    [10, "4", "6", "6", "Pending"],
    [20, "2", "3", "3", "Pending"],
    [30, "0", "0", "4", "Cancelled"],
  ]);
  const dcRow = (await d.client.request("dc.list", { query: {} })).items[0]!;
  expect([dcRow.invoice?.id, text(dcRow.dspQty), text(dcRow.rcdQty)]).toEqual([invoice.id, "6", "4"]);

  const before = await d.everything();
  const deleteDc = () => d.client.request("dc.delete", { params: { id: dc.id } });
  const deleteInvoice = () => d.client.request("invoice.delete", { params: { id: invoice.id } });
  expect(await refused(deleteDc())).toMatchObject({
    status: 409,
    code: "delete-blocked",
    message: "This DC has an invoice. Delete the invoice first.",
    details: { reason: "dc-has-invoice" },
  });
  expect(await refused(deleteInvoice())).toMatchObject({
    status: 409,
    code: "delete-blocked",
    message: "An SRV is linked to this invoice, so it cannot be deleted.",
    details: { reason: "invoice-linked-srv" },
  });
  expect(await d.everything()).toEqual(before);

  // Deleting the invoice is still not enough while the SRV cites the DC.
  await d.client.request("srv.delete", { params: { id: srvId } });
  await deleteInvoice();
  const srvAgain = await d.uploadSrv("S-2", "26/04/2025", { challan: "7" });
  expect(await refused(deleteDc())).toMatchObject({
    status: 409,
    code: "delete-blocked",
    details: { reason: "dc-linked-srv" },
  });

  await d.client.request("srv.delete", { params: { id: srvAgain } });
  await deleteDc();
  expect([await d.itemsOf(d.po.id), await d.flagsOf(d.po.id)]).toEqual([start, []]);
  const lists = [
    await d.client.request("dc.list", { query: {} }),
    await d.client.request("invoice.list", { query: {} }),
    await d.client.request("srv.list", { query: {} }),
  ];
  expect(lists.map((l) => l.total)).toEqual([0, 0, 0]);
  // One audit row per document write, in order.
  const { items: audit } = await d.client.request("audit.list", { query: { pageSize: 100, sort: "at" } });
  expect(audit.filter((a) => ["dc", "invoice", "srv"].includes(a.entityType)).map((a) => a.action)).toEqual([
    "dc.create",
    "invoice.create",
    "srv.ingest",
    "srv.delete",
    "invoice.delete",
    "srv.ingest",
    "srv.delete",
    "dc.delete",
  ]);
});
