import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { zErrorBody, zListQuery, zPaged, zQty } from "../src/index.ts";

describe("zListQuery: page, pageSize, sort, dir and typed filters (ARCHITECTURE §9)", () => {
  const query = zListQuery(["poNumber", "poDate"], { status: z.enum(["Pending", "Closed"]).optional() });

  it("defaults to the first page of 10 rows, ascending, unsorted", () => {
    expect(query.parse({})).toEqual({ page: 1, pageSize: 10, dir: "asc" });
  });

  it("coerces query-string values and keeps the typed filter", () => {
    expect(query.parse({ page: "3", pageSize: "25", sort: "poDate", dir: "desc", status: "Closed" })).toEqual({
      page: 3,
      pageSize: 25,
      sort: "poDate",
      dir: "desc",
      status: "Closed",
    });
  });

  it.each(["10", "25", "50", "100"])("accepts the legacy page size %s", (pageSize) => {
    expect(query.parse({ pageSize }).pageSize).toBe(Number(pageSize));
  });

  it.each([
    ["an unknown sort column", { sort: "material" }],
    ["page 0", { page: "0" }],
    ["a fractional page", { page: "1.5" }],
    ["a non-numeric page", { page: "abc" }],
    ["an empty page", { page: "" }],
    ["page size 20", { pageSize: "20" }],
    ["dir up", { dir: "up" }],
    ["an unknown filter value", { status: "Delivered" }],
  ])("rejects %s", (_name, input) => {
    expect(query.safeParse(input).success).toBe(false);
  });
});

describe("zPaged: { items, total }", () => {
  const paged = zPaged(z.object({ qty: zQty }));

  it("decodes and encodes each item through its codec", () => {
    const wire = { items: [{ qty: "2.5" }, { qty: "0.001" }], total: 12 };
    expect(z.decode(paged, wire)).toEqual({ items: [{ qty: 2500 }, { qty: 1 }], total: 12 });
    expect(z.encode(paged, z.decode(paged, wire))).toEqual(wire);
  });

  it.each([
    ["a negative total", { items: [], total: -1 }],
    ["a fractional total", { items: [], total: 1.5 }],
    ["a missing total", { items: [] }],
  ])("rejects %s", (_name, input) => {
    expect(paged.safeParse(input).success).toBe(false);
  });
});

describe("zErrorBody: { code, message, details? }", () => {
  it.each([
    [{ code: "version-conflict", message: "Someone else changed this DC. Reload and try again." }],
    [
      {
        code: "delete-blocked",
        message: "This DC has an invoice. Delete the invoice first.",
        details: { reason: "dc-has-invoice" },
      },
    ],
  ])("accepts %j", (body) => {
    expect(zErrorBody.parse(body)).toEqual(body);
  });

  it.each([
    ["a missing message", { code: "not-found" }],
    ["an empty code", { code: "", message: "Not found." }],
    ["an extra key", { code: "not-found", message: "Not found.", stack: "at x" }],
    ["array details", { code: "invalid", message: "Invalid.", details: ["qty"] }],
  ])("rejects %s", (_name, body) => {
    expect(zErrorBody.safeParse(body).success).toBe(false);
  });
});
