// SPEC-07 PR 5: the supplier profile, settings, buyers (INV-86) and the BHEL password (INV-81). Every write is one
// batch with one audit row; the BHEL password never leaves the API.
import { secret, settings } from "@senstosales/db";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { closeApiApps, onboardedApp, SUPPLIER_WIRE } from "./api-app.ts";
import { ID, json, testApp } from "./helpers.ts";
import { apiRoutes } from "../src/routes/index.ts";

afterEach(closeApiApps);

const NOT_FOUND = { code: "not-found", message: "This buyer was not found." };

describe("supplier", () => {
  it("returns the onboarded profile", async () => {
    const { send } = await onboardedApp();
    const res = await send("/api/supplier");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: expect.any(String), ...SUPPLIER_WIRE });
  });

  it("updates the profile with one audit row of before and after", async () => {
    const { send, audit } = await onboardedApp();
    const changed = { ...SUPPLIER_WIRE, name: "Renamed Supplier", gstin: null };
    const res = await send("/api/supplier", json("PUT", changed));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(await (await send("/api/supplier")).json()).toEqual({ id, ...changed });

    const rows = await audit();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      action: "update-supplier",
      entityType: "supplier",
      entityId: id,
      before: { id, ...SUPPLIER_WIRE },
      after: { id, ...changed },
    });
  });

  it("rejects a profile without a name", async () => {
    const { send } = await onboardedApp();
    const { name: _, ...noName } = SUPPLIER_WIRE;
    expect((await send("/api/supplier", json("PUT", noName))).status).toBe(400);
  });
});

describe("settings", () => {
  it("returns the onboarding rates and no preferences", async () => {
    const { send } = await onboardedApp();
    expect(await (await send("/api/settings")).json()).toEqual({ cgstPct: "6", sgstPct: "6", preferences: {} });
  });

  it("replaces the rates and preferences with one audit row", async () => {
    const { send, db, audit } = await onboardedApp();
    const next = { cgstPct: "9", sgstPct: "2.5", preferences: { theme: "dark" } };
    const res = await send("/api/settings", json("PUT", next));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(next);
    expect(await (await send("/api/settings")).json()).toEqual(next);

    await send("/api/settings", json("PUT", { ...next, preferences: {} }));
    const keys = await db.query(db.build.select({ key: settings.key }).from(settings).orderBy(settings.key));
    expect(keys.map((r) => r.key)).toEqual(["cgst_pct", "sgst_pct"]);

    const rows = await audit();
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      action: "update-settings",
      entityType: "settings",
      before: { cgstPct: "6", sgstPct: "6", preferences: {} },
      after: next,
    });
  });

  it("keeps the GST rates when a preference reuses their key", async () => {
    const { send } = await onboardedApp();
    const res = await send(
      "/api/settings",
      json("PUT", { cgstPct: "9", sgstPct: "9", preferences: { cgst_pct: "1" } }),
    );
    expect(await res.json()).toEqual({ cgstPct: "9", sgstPct: "9", preferences: {} });
  });

  it("rejects a negative rate", async () => {
    const { send } = await onboardedApp();
    expect((await send("/api/settings", json("PUT", { cgstPct: "-1", sgstPct: "9", preferences: {} }))).status).toBe(
      400,
    );
  });
});

describe("buyers (INV-86)", () => {
  const UNIT = { unitName: "Example Unit B", state: "Example State", stateCode: "99", gstin: null };

  it("creates, lists by unit name, updates and deletes, each with one audit row", async () => {
    const { send, audit } = await onboardedApp();
    expect(await (await send("/api/buyers")).json()).toEqual([]);

    const b = (await (await send("/api/buyers", json("POST", UNIT))).json()) as { id: string };
    expect(b).toEqual({ id: expect.stringMatching(/^[0-9A-Z]{26}$/), ...UNIT });
    const a = (await (await send("/api/buyers", json("POST", { ...UNIT, unitName: "Example Unit A" }))).json()) as {
      id: string;
    };
    expect(((await (await send("/api/buyers")).json()) as { id: string }[]).map((r) => r.id)).toEqual([a.id, b.id]);

    const updated = { ...UNIT, gstin: "TESTGSTIN0002" };
    const res = await send(`/api/buyers/${b.id}`, json("PUT", updated));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: b.id, ...updated });

    expect(await (await send(`/api/buyers/${a.id}`, json("DELETE", {}))).json()).toEqual({ ok: true });
    expect(await (await send("/api/buyers")).json()).toEqual([{ id: b.id, ...updated }]);

    const rows = await audit();
    expect(rows.slice(1).map((r) => [r.action, r.entityType, r.entityId])).toEqual([
      ["create-buyer", "buyer", b.id],
      ["create-buyer", "buyer", a.id],
      ["update-buyer", "buyer", b.id],
      ["delete-buyer", "buyer", a.id],
    ]);
    expect(rows[3]).toMatchObject({ before: { id: b.id, ...UNIT }, after: { id: b.id, ...updated } });
  });

  it("answers 404 for an unknown buyer and 400 for a malformed id", async () => {
    const { send, audit } = await onboardedApp();
    const update = await send(`/api/buyers/${ID}`, json("PUT", UNIT));
    expect(update.status).toBe(404);
    expect(await update.json()).toEqual(NOT_FOUND);
    expect((await send(`/api/buyers/${ID}`, json("DELETE", {}))).status).toBe(404);
    expect((await send("/api/buyers/not-an-id", json("DELETE", {}))).status).toBe(400);
    expect(await audit()).toHaveLength(1);
  });
});

describe("BHEL password (INV-81)", () => {
  const PASSWORD = "Example-Portal-Pass-7f3a";

  it("is saved, read back only by the services, then cleared", async () => {
    const { send, db, services } = await onboardedApp();
    expect(await (await send("/api/settings/bhel-password")).json()).toEqual({ saved: false });

    const set = await send("/api/settings/bhel-password", json("PUT", { password: PASSWORD }));
    expect(await set.json()).toEqual({ saved: true });
    expect(await (await send("/api/settings/bhel-password")).json()).toEqual({ saved: true });
    expect(await services.secrets.get("bhel-password")).toBe(PASSWORD);

    await send("/api/settings/bhel-password", json("PUT", { password: `${PASSWORD}-2` }));
    expect(await db.query(db.build.select({ value: secret.value }).from(secret))).toEqual([{ value: `${PASSWORD}-2` }]);

    const cleared = await send("/api/settings/bhel-password", json("DELETE", {}));
    expect(await cleared.json()).toEqual({ saved: false });
    expect(await services.secrets.get("bhel-password")).toBeNull();
  });

  it("never appears in a response, a log line or an audit row", async () => {
    const { send, bodies, logger, audit } = await onboardedApp();
    await send("/api/settings/bhel-password", json("PUT", { password: PASSWORD }));
    await send("/api/settings/bhel-password");
    await send("/api/settings");
    await send("/api/supplier");
    await send("/api/settings/bhel-password", json("PUT", { password: PASSWORD, extra: 1 }));
    await send("/api/settings/bhel-password", json("DELETE", {}));

    const rows = await audit();
    expect(rows.slice(1).map((r) => [r.action, r.entityType, r.before, r.after])).toEqual([
      ["set-bhel-password", "secret", null, null],
      ["set-bhel-password", "secret", null, null],
      ["clear-bhel-password", "secret", null, null],
    ]);
    const seen = [...bodies, JSON.stringify(logger.lines), JSON.stringify(rows)].join("\n");
    expect(seen).not.toContain(PASSWORD);
  });

  it("rejects an empty password", async () => {
    const { send } = await onboardedApp();
    const res = await send("/api/settings/bhel-password", json("PUT", { password: "" }));
    expect(res.status).toBe(400);
  });
});

describe("session", () => {
  it("every settings route needs a session", async () => {
    const { services } = await onboardedApp();
    const { send } = testApp(apiRoutes(services), () => Promise.resolve(false));
    for (const path of ["/api/supplier", "/api/settings", "/api/settings/bhel-password", "/api/buyers"]) {
      expect((await send(path)).status).toBe(401);
    }
  });
});
