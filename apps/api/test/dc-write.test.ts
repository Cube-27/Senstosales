// SPEC-11 PR 2: DC header edit and delete, over HTTP on the full app. Lines never change after save (INV-33); a
// changed date moves the DC to its FY and re-links the SRV items citing it (INV-25, EC-14); delete is refused while
// an invoice or an SRV item links the DC (INV-35); a stale version is a 409 (INV-95). Each write is one batch with
// recompute, flags, link re-resolution and an audit row (C4). Synthetic values only (C1).
import { srvItem } from "@senstosales/db";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import type { Json } from "./dc-fixtures.ts";
import { gatedBatch, heldBatches, HEADER, PO, ready } from "./dc-fixtures.ts";
import { json } from "./helpers.ts";
import { id } from "./seed-rows.ts";
import { srvPage } from "./srv-pages.ts";

afterEach(closeApiApps);

type Ready = Awaited<ReturnType<typeof ready>>;

/** PO 4500001 with DC 7 dated 2025-04-02: 4 of item 10 and 5 of item 20. */
async function withDc7(overrides?: Parameters<typeof ready>[0]) {
  const r = await ready(overrides);
  const po = await r.storedPo();
  const created = await r.createDc({
    poId: po.poId,
    number: "7",
    dcDate: "2025-04-02",
    items: [
      { poItemId: po.item10, dspQty: "4" },
      { poItemId: po.item20, dspQty: "5" },
    ],
  });
  return { ...r, ...po, dc7: created.body };
}

/** Uploads one SRV of `po` dated `date` (dd/mm/yyyy) whose item 10 cites challan `challan`. */
async function srvCiting(r: Ready, po: string, date: string, challan: string) {
  const html = srvPage(po, [{ srv: `S-${po}-${date}`, date, item: 10, code: "M-10", challan, rcd: "3" }]);
  const res = await r.app.client.request("srv.upload", { body: { files: [{ name: "srv.html", html }] } });
  expect(res.results.map((x) => x.status)).toEqual(["accepted"]);
}

const links = (r: Ready) =>
  r.app.db.query(
    r.app.db.build
      .select({ challanNo: srvItem.challanNo, resolvedDcId: srvItem.resolvedDcId })
      .from(srvItem)
      .orderBy(srvItem.id),
  );

/** The edit body of DC 7 as stored, with `change` applied. */
const edit = (change: Json = {}) => ({
  ...HEADER,
  number: "7",
  dcDate: "2025-04-02",
  gcNumber: "7",
  gcDate: "2025-04-02",
  version: 1,
  ...change,
});

const put = (r: Ready, dcId: string, body: Json) => r.send(`/api/dc/${dcId}`, json("PUT", body));
const del = (r: Ready, dcId: string) => r.send(`/api/dc/${dcId}`, json("DELETE", {}));

describe("PUT /api/dc/:id", () => {
  test("changes header fields, bumps the version and writes one audit row; lines stay as saved (INV-33)", async () => {
    const r = await withDc7();
    const res = await put(
      r,
      r.dc7.id,
      // Lines in the body are not part of an edit: they are dropped, and the saved ones stay.
      edit({ vehicleNo: "VEH-2", consigneeName: "Example Consignee", items: [{ poItemId: r.item10, dspQty: "9" }] }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ vehicleNo: "VEH-2", consigneeName: "Example Consignee", version: 2 });
    expect((await r.dcLines()).map((l) => l.dspQty)).toEqual([4000, 5000]);
    expect((await r.items()).map((i) => i.dspQty)).toEqual([4000, 5000]);
    expect(await r.auditOf("dc.update")).toEqual([
      expect.objectContaining({
        entityType: "dc",
        entityId: r.dc7.id,
        before: expect.objectContaining({ vehicleNo: null, consigneeName: null, version: 1 }),
        after: expect.objectContaining({ vehicleNo: "VEH-2", consigneeName: "Example Consignee", version: 2 }),
      }),
    ]);
  });

  test("a blank GC number and date take the DC's (INV-26)", async () => {
    const r = await withDc7();
    const res = await put(r, r.dc7.id, edit({ number: " 9 ", dcDate: "2025-04-10", gcNumber: "  ", gcDate: null }));
    expect(res.body).toMatchObject({ number: "9", dcDate: "2025-04-10", gcNumber: "9", gcDate: "2025-04-10" });
  });

  test("saves the lot line's text (owner, 2026-10-16)", async () => {
    const r = await withDc7();
    expect(r.dc7).toMatchObject({ lotNo: null });
    const res = await put(r, r.dc7.id, edit({ lotNo: "12345 - Example Agency" }));
    expect(res.body).toMatchObject({ lotNo: "12345 - Example Agency", version: 2 });
  });

  test("a stale version is a 409 and changes nothing (INV-95)", async () => {
    const r = await withDc7();
    expect((await put(r, r.dc7.id, edit({ vehicleNo: "VEH-2" }))).status).toBe(200);
    const before = await r.dcs();
    const res = await put(r, r.dc7.id, edit({ vehicleNo: "VEH-3" }));
    expect([res.status, res.body.code]).toEqual([409, "stale-version"]);
    expect(await r.dcs()).toEqual(before);
    expect(await r.auditOf("dc.update")).toHaveLength(1);
  });

  test("an unknown DC is a 404", async () => {
    const r = await ready();
    const res = await put(r, id("ZZ"), edit());
    expect([res.status, res.body.code]).toEqual([404, "dc-not-found"]);
  });

  test("a blank number is a 400", async () => {
    const r = await withDc7();
    const res = await put(r, r.dc7.id, edit({ number: " " }));
    expect([res.status, res.body.code]).toEqual([400, "number-blank"]);
  });

  test("re-dating DC 7 into FY 2024-25 drops the SRV link and raises no flag (INV-25, EC-14, INV-53)", async () => {
    const r = await withDc7();
    await srvCiting(r, "4500001", "25/04/2025", "7");
    expect(await links(r)).toEqual([{ challanNo: "7", resolvedDcId: r.dc7.id }]);

    const res = await put(r, r.dc7.id, edit({ dcDate: "2025-03-30", gcDate: null }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dcDate: "2025-03-30", financialYear: "2024-25", gcDate: "2025-03-30" });
    expect(await links(r)).toEqual([{ challanNo: "7", resolvedDcId: null }]);
    // A number with no DC in the SRV's FY is not a conflict (A-10 revised).
    expect((await r.flags()).filter((f) => f.type === "DOC_NUMBER_CONFLICT")).toEqual([]);
  });

  test("an SRV of another PO citing the DC is flagged on that PO, and the flag waits after the link drops (INV-53, INV-59)", async () => {
    const r = await withDc7();
    const other = await r.storedPo({ ...PO, poNumber: "4500002" });
    await srvCiting(r, "4500002", "25/04/2025", "7");
    expect(await links(r)).toEqual([{ challanNo: "7", resolvedDcId: r.dc7.id }]);
    const conflicts = async () =>
      (await r.flags()).filter((f) => f.type === "DOC_NUMBER_CONFLICT").map((f) => [f.poId, f.details.docIds]);
    expect(await conflicts()).toEqual([[other.poId, [r.dc7.id]]]);

    expect((await put(r, r.dc7.id, edit({ number: "8", gcNumber: null }))).status).toBe(200);
    expect(await links(r)).toEqual([{ challanNo: "7", resolvedDcId: null }]);
    expect(await conflicts()).toEqual([[other.poId, [r.dc7.id]]]);
  });

  test("renumbering links the SRV items citing the new number in the DC's FY (INV-37)", async () => {
    const r = await withDc7();
    await srvCiting(r, "4500001", "25/04/2025", "8");
    expect((await put(r, r.dc7.id, edit({ number: "8", gcNumber: null }))).status).toBe(200);
    expect(await links(r)).toEqual([{ challanNo: "8", resolvedDcId: r.dc7.id }]);
  });

  test("re-dating into a taken (number, FY) is a 409 naming it, and nothing changes (INV-25)", async () => {
    const r = await withDc7();
    await r.createDc({ poId: r.poId, number: "7", dcDate: "2025-03-20", items: [{ poItemId: r.item10, dspQty: "1" }] });
    await srvCiting(r, "4500001", "25/04/2025", "7");
    const [before, linked] = [await r.dcs(), await links(r)];

    const res = await put(r, r.dc7.id, edit({ dcDate: "2025-03-30", gcDate: null }));
    expect([res.status, res.body.code, res.body["message"]]).toEqual([
      409,
      "dc-number-taken",
      "DC 7 already exists in FY 2024-25.",
    ]);
    expect([await r.dcs(), await links(r), await r.auditOf("dc.update")]).toEqual([before, linked, []]);
  });

  test("a GC number taken in the FY is a 409 naming the GC", async () => {
    const r = await withDc7();
    await r.createDc({
      poId: r.poId,
      number: "8",
      dcDate: "2025-04-05",
      gcNumber: "G-1",
      items: [{ poItemId: r.item10, dspQty: "1" }],
    });
    const res = await put(r, r.dc7.id, edit({ gcNumber: "G-1" }));
    expect([res.status, res.body.code, res.body["message"]]).toEqual([
      409,
      "gc-number-taken",
      "GC G-1 already exists in FY 2025-26.",
    ]);
  });
});

describe("DELETE /api/dc/:id", () => {
  test("removes the DC and its lines, recomputes the PO and writes one audit row", async () => {
    const r = await withDc7();
    const res = await del(r, r.dc7.id);
    expect([res.status, res.body]).toEqual([200, { ok: true }]);
    expect([await r.dcs(), await r.dcLines()]).toEqual([[], []]);
    expect((await r.items()).map((i) => [i.dspQty, i.balanceQty, i.status])).toEqual([
      [0, 10000, "Pending"],
      [0, 5000, "Pending"],
    ]);
    expect(await r.auditOf("dc.delete")).toEqual([
      expect.objectContaining({
        entityType: "dc",
        entityId: r.dc7.id,
        before: {
          poId: r.poId,
          number: "7",
          dcDate: "2025-04-02",
          financialYear: "2025-26",
          gcNumber: "7",
          gcDate: "2025-04-02",
          version: 1,
          items: [
            { poItemId: r.item10, dspQty: 4000 },
            { poItemId: r.item20, dspQty: 5000 },
          ],
        },
        after: null,
      }),
    ]);
  });

  test("a DC with an invoice is a 409 with the reason, and nothing changes (INV-35)", async () => {
    const r = await withDc7();
    await r.invoiceOnDc({ id: id("A1"), dcId: r.dc7.id, number: "1", invoiceDate: "2025-04-03" });
    const before = [await r.dcs(), await r.dcLines(), await r.items()];
    const res = await del(r, r.dc7.id);
    expect([res.status, res.body.code, res.body["details"]]).toEqual([
      409,
      "delete-blocked",
      { reason: "dc-has-invoice" },
    ]);
    expect([await r.dcs(), await r.dcLines(), await r.items()]).toEqual(before);
    expect(await r.auditOf("dc.delete")).toEqual([]);
  });

  test("a DC an SRV item links is a 409 with the reason (INV-35)", async () => {
    const r = await withDc7();
    await srvCiting(r, "4500001", "25/04/2025", "7");
    const res = await del(r, r.dc7.id);
    expect([res.status, res.body.code, res.body["details"]]).toEqual([
      409,
      "delete-blocked",
      { reason: "dc-linked-srv" },
    ]);
    expect(await r.dcs()).toHaveLength(1);
  });

  test("an unknown DC is a 404", async () => {
    const r = await ready();
    const res = await del(r, id("ZZ"));
    expect([res.status, res.body.code]).toEqual([404, "dc-not-found"]);
  });
});

describe("two writes built from the same read before either commits", () => {
  test("two edits of version 1: one saves, the other is a 409 and writes nothing", async () => {
    const held = heldBatches();
    const r = await withDc7({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all([
      put(r, r.dc7.id, edit({ vehicleNo: "VEH-A" })),
      put(r, r.dc7.id, edit({ vehicleNo: "VEH-B" })),
    ]);
    expect(results.map((x) => [x.status, x.body.code]).sort()).toEqual([
      [200, undefined],
      [409, "stale-version"],
    ]);
    expect((await r.dcs()).map((d) => d.version)).toEqual([2]);
    expect(await r.auditOf("dc.update")).toHaveLength(1);
  });

  test("two deletes: one removes the DC, the other is a 404 and writes nothing", async () => {
    const held = heldBatches();
    const r = await withDc7({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all([del(r, r.dc7.id), del(r, r.dc7.id)]);
    expect(results.map((x) => [x.status, x.body.code]).sort()).toEqual([
      [200, undefined],
      [404, "dc-not-found"],
    ]);
    expect(await r.auditOf("dc.delete")).toHaveLength(1);
  });

  test("an edit built before a delete commits: the delete removes the DC, the edit is a 404 and writes nothing", async () => {
    const gate = gatedBatch();
    const r = await withDc7({ db: gate.wrap });
    const held = gate.close();
    const edited = put(r, r.dc7.id, edit({ vehicleNo: "VEH-A" }));
    await held.reached;
    expect((await del(r, r.dc7.id)).status).toBe(200);
    held.open();
    const res = await edited;
    expect([res.status, res.body.code]).toEqual([404, "dc-not-found"]);
    expect([await r.dcs(), await r.auditOf("dc.update")]).toEqual([[], []]);
  });

  test("an SRV that links the DC after the delete read it: the delete is a 409 and the link stays", async () => {
    const gate = gatedBatch();
    const r = await withDc7({ db: gate.wrap });
    const held = gate.close();
    const pending = del(r, r.dc7.id);
    await held.reached;
    await srvCiting(r, "4500001", "25/04/2025", "7");
    held.open();
    const res = await pending;
    expect([res.status, res.body.code, res.body["details"]]).toEqual([
      409,
      "delete-blocked",
      { reason: "dc-linked-srv" },
    ]);
    expect(await r.dcs()).toHaveLength(1);
    expect(await links(r)).toEqual([{ challanNo: "7", resolvedDcId: r.dc7.id }]);
    expect(await r.auditOf("dc.delete")).toEqual([]);
  });
});
