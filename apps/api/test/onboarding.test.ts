// SPEC-07 PR 5: first-run onboarding (INV-78, ARCHITECTURE §10.3). With no supplier row only public routes answer;
// onboarding creates the supplier and its GST rates in one batch with one audit row, and answers only once.
import { buyer, secret, settings, supplier } from "@senstosales/db";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { apiApp, closeApiApps, ONBOARDING_WIRE, SUPPLIER_WIRE } from "./api-app.ts";
import { json } from "./helpers.ts";

const ONBOARDING_REQUIRED = { code: "onboarding-required", message: "Set up the supplier details first." };
const ALREADY_SET_UP = { code: "already-set-up", message: "The supplier details are already set up." };

afterEach(closeApiApps);

const complete = (send: (path: string, init?: RequestInit) => Promise<Response>, body: unknown = ONBOARDING_WIRE) =>
  send("/api/onboarding", json("POST", body));

describe("before onboarding (INV-78)", () => {
  it("seeds nothing identifying", async () => {
    const { db } = await apiApp();
    for (const table of [supplier, settings, buyer, secret]) {
      expect(await db.query(db.build.select().from(table))).toEqual([]);
    }
  });

  it("reports onboarding as required", async () => {
    const { send } = await apiApp();
    const res = await send("/api/onboarding");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ required: true });
  });

  it("refuses a signed-in route with onboarding-required", async () => {
    const { send } = await apiApp();
    const res = await send("/api/buyers");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(ONBOARDING_REQUIRED);
  });

  it("still answers public routes", async () => {
    const { send } = await apiApp();
    const res = await send("/api/auth/session");
    expect(res.status).toBe(200);
  });
});

describe("completing onboarding", () => {
  it("creates the supplier and its GST rates and opens the app", async () => {
    const { send, db } = await apiApp();
    const res = await complete(send);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body).toEqual({ id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/), ...SUPPLIER_WIRE });

    const rows = await db.query(db.build.select().from(settings).orderBy(settings.key));
    expect(rows).toEqual([
      { supplierId: body.id, key: "cgst_pct", value: "6" },
      { supplierId: body.id, key: "sgst_pct", value: "6" },
    ]);
    expect(await (await send("/api/onboarding")).json()).toEqual({ required: false });
    expect((await send("/api/buyers")).status).toBe(200);
  });

  it("writes one audit row with the new values", async () => {
    const { send, audit } = await apiApp();
    const { id } = (await (await complete(send)).json()) as { id: string };
    expect(await audit()).toEqual([
      {
        id: expect.any(String),
        at: "2025-06-01T05:30:00.000Z",
        actor: "admin",
        action: "supplier.create",
        entityType: "supplier",
        entityId: id,
        before: null,
        after: { ...SUPPLIER_WIRE, id, cgstPct: "6", sgstPct: "6" },
        jobId: null,
      },
    ]);
  });

  it("answers only once", async () => {
    const { send, db } = await apiApp();
    expect((await complete(send)).status).toBe(200);
    const again = await complete(send, { ...ONBOARDING_WIRE, name: "Other Supplier" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual(ALREADY_SET_UP);
    expect((await db.query(db.build.select({ name: supplier.name }).from(supplier))).map((r) => r.name)).toEqual([
      "Example Supplier",
    ]);
  });

  it("creates one supplier when two submits overlap", async () => {
    const { send, db, audit } = await apiApp();
    const statuses = (await Promise.all([complete(send), complete(send)])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(await db.query(db.build.select().from(supplier))).toHaveLength(1);
    expect(await db.query(db.build.select().from(settings))).toHaveLength(2);
    expect(await audit()).toHaveLength(1);
  });

  it("rejects a body without a name and writes nothing", async () => {
    const { send, db } = await apiApp();
    const { name: _, ...noName } = ONBOARDING_WIRE;
    const res = await complete(send, noName);
    expect(res.status).toBe(400);
    expect(await db.query(db.build.select().from(supplier))).toEqual([]);
  });
});
