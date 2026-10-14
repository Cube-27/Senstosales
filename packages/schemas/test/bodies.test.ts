import { describe, expect, it } from "vite-plus/test";

import { routes, zDcHeader, zInvoiceHeader } from "../src/index.ts";

const ID = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";
const ITEM = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B4";

const nulls = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, null]));

// Every header field is optional text, a date or a GSTIN, so all-null is a valid header.
const invoiceHeader = nulls(Object.keys(zInvoiceHeader.shape));
const dcHeader = nulls(Object.keys(zDcHeader.shape));

describe("invoice create: DC-sourced or PO-direct, one PO (INV-29, INV-30, A-16)", () => {
  const body = routes["invoice.create"].body;
  const fields = { number: "7", invoiceDate: "2025-04-03", ...invoiceHeader };

  it("decodes DC-sourced lines with the DC qty and PO rate as sent", () => {
    const wire = { ...fields, kind: "dc", dcId: ID, lines: [{ dcItemId: ITEM, qty: "2.5", rate: "848.75" }] };
    expect(body.parse(wire)).toMatchObject({ kind: "dc", lines: [{ dcItemId: ITEM, qty: 2500, rate: 84875000 }] });
  });

  it("decodes PO-direct lines, which take no rate", () => {
    const wire = { ...fields, kind: "direct", poId: ID, lines: [{ poItemId: ITEM, qty: "4", rate: "1" }] };
    expect(body.parse(wire)).toMatchObject({ kind: "direct", poId: ID, lines: [{ poItemId: ITEM, qty: 4000 }] });
    expect(body.parse(wire).lines[0]).not.toHaveProperty("rate");
  });

  it.each([
    ["a multi-PO invoice", { ...fields, kind: "direct", poIds: [ID], lines: [] }],
    ["an unknown kind", { ...fields, kind: "multi", poId: ID, lines: [] }],
    ["a float quantity", { ...fields, kind: "direct", poId: ID, lines: [{ poItemId: ITEM, qty: 2.5 }] }],
  ])("rejects %s", (_name, wire) => {
    expect(body.safeParse(wire).success).toBe(false);
  });
});

describe("header edits carry no lines (INV-33)", () => {
  it("drops lines sent with a DC edit", () => {
    const wire = { number: "12", dcDate: "2025-04-03", version: 2, gcNumber: null, gcDate: null, ...dcHeader };
    const decoded = routes["dc.update"].body.parse({ ...wire, items: [{ poItemId: ITEM, dspQty: "9" }] });
    expect(decoded).toEqual(wire);
  });

  it("drops lines sent with an invoice edit", () => {
    const wire = { number: "7", invoiceDate: "2025-04-03", version: 1, ...invoiceHeader };
    const decoded = routes["invoice.update"].body.parse({ ...wire, lines: [{ dcItemId: ITEM, qty: "9" }] });
    expect(decoded).toEqual(wire);
  });
});

describe("DC create: GC number and date may be blank (INV-26)", () => {
  it("accepts null GC fields for the service to default", () => {
    const wire = {
      poId: ID,
      number: "12",
      dcDate: "2025-04-03",
      gcNumber: null,
      gcDate: null,
      ...dcHeader,
      items: [{ poItemId: ITEM, dspQty: "0.5" }],
    };
    expect(routes["dc.create"].body.parse(wire)).toEqual({ ...wire, items: [{ poItemId: ITEM, dspQty: 500 }] });
  });
});

describe("jobs.start: one body per job type (ARCHITECTURE §7.3)", () => {
  const body = routes["jobs.start"].body;

  it.each([
    [{ type: "po.import-folder", stagingId: ID }],
    [{ type: "srv.scrape", sessionId: ID, poIds: ["4500012345"] }],
    [{ type: "recompute-all" }],
  ])("accepts %j", (wire) => {
    expect(body.parse(wire)).toEqual(wire);
  });

  it.each([
    ["a PO id that is not 1-10 digits (C17)", { type: "po.scrape", sessionId: ID, poIds: ["45000x"] }],
    ["an 11-digit PO id (C17)", { type: "po.scrape", sessionId: ID, poIds: ["45000123456"] }],
    ["a folder import without its staging id", { type: "srv.import-folder" }],
    ["a file path instead of a staging id (C17)", { type: "po.import-folder", stagingId: "C:/data/po" }],
    ["the dropped reconcile-all", { type: "reconcile-all" }],
  ])("rejects %s", (_name, wire) => {
    expect(body.safeParse(wire).success).toBe(false);
  });
});

describe("auth bodies (INV-80, C11)", () => {
  const change = routes["auth.changePassword"].body;

  it("accepts any non-empty new password: no complexity rule", () => {
    const wire = { currentPassword: "admin", newPassword: "a", confirmPassword: "a" };
    expect(change.parse(wire)).toEqual(wire);
  });

  it("rejects a confirmation that differs, at the confirmation field", () => {
    const result = change.safeParse({ currentPassword: "admin", newPassword: "abc", confirmPassword: "abd" });
    expect(result.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [["confirmPassword"], "The two new passwords do not match."],
    ]);
  });
});

describe("queries", () => {
  it("search takes one type or several (repeated key)", () => {
    const query = routes["search.query"].query;
    expect(query.parse({ q: "12", types: "dc" })).toEqual({ q: "12", types: ["dc"] });
    expect(query.parse({ q: "12", types: ["dc", "invoice"] })).toEqual({ q: "12", types: ["dc", "invoice"] });
  });

  it("PO list filters decode money and flags from query strings", () => {
    const query = routes["po.list"].query;
    expect(query.parse({ valueMin: "1000", flagged: "true", status: "Pending" })).toEqual({
      page: 1,
      pageSize: 10,
      dir: "asc",
      valueMin: 100000000,
      flagged: true,
      status: "Pending",
    });
  });

  it("rejects a sort column the list does not show (SPEC-10 §4.2)", () => {
    expect(routes["dc.list"].query.safeParse({ sort: "supplierName" }).success).toBe(false);
  });
});

describe("export selected: the selected POs' reconciliation rows (SPEC-13 §2)", () => {
  const body = routes["reports.exportSelected"].body;

  it("takes the selected PO ids", () => {
    expect(body.parse({ poIds: [ID] })).toEqual({ poIds: [ID] });
  });

  it("rejects an empty selection", () => {
    expect(body.safeParse({ poIds: [] }).success).toBe(false);
  });
});

describe("uploads (SPEC-08)", () => {
  it("needs at least one file", () => {
    expect(routes["po.upload"].body.safeParse({ files: [] }).success).toBe(false);
  });

  it("reports each file as accepted, skipped or failed", () => {
    const wire = {
      results: [
        { name: "a.html", status: "accepted", reason: null },
        { name: "b.html", status: "skipped", reason: "An equal or newer PO is already saved." },
      ],
    };
    expect(routes["po.upload"].response.parse(wire)).toEqual(wire);
    expect(
      routes["po.upload"].response.safeParse({ results: [{ name: "c", status: "ok", reason: null }] }).success,
    ).toBe(false);
  });
});

describe("BHEL wizard steps (SPEC-19 §4.2)", () => {
  const step = routes["bhel.captcha"].response;

  it.each([
    [{ step: "otp", message: null }],
    [{ step: "captcha", captchaPng: "iVBORw0KGgo=", message: "The captcha was wrong. Try the new one." }],
    [{ step: "ready" }],
  ])("accepts %j", (wire) => {
    expect(step.parse(wire)).toEqual(wire);
  });

  it("rejects a captcha step without its new image", () => {
    expect(step.safeParse({ step: "captcha", message: "Try again." }).success).toBe(false);
  });
});

describe("the BHEL password is never returned (INV-81)", () => {
  it("answers with saved status only", () => {
    const res = routes["settings.setBhelPassword"].response;
    expect(res.parse({ saved: true, password: "secret" })).toEqual({ saved: true });
  });
});
