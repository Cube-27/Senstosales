import { describe, expect, it } from "vite-plus/test";

import { z } from "zod";

import { type RouteDef, routes } from "../src/index.ts";

const table: (RouteDef & { name: string })[] = Object.entries(routes).map(([name, def]) => ({ name, ...def }));
const ID = "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3";

describe("route table (SPEC-04 §4.3, INV-101)", () => {
  it("has one entry per method and path", () => {
    const keys = table.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("serves every path under /api with kebab-case segments and :params", () => {
    for (const r of table) expect(r.path, r.name).toMatch(/^\/api(\/([a-z0-9]+(-[a-z0-9]+)*|:[a-zA-Z]+))+$/);
  });

  it("validates each :segment of a path as an id", () => {
    const params = routes["po.setManualDispatched"].params;
    expect(params.parse({ id: ID, itemId: ID })).toEqual({ id: ID, itemId: ID });
    expect(params.safeParse({ id: ID, itemId: "abc" }).success).toBe(false);
    expect(params.safeParse({ id: ID }).success).toBe(false);
  });

  it("takes a body only on writes, and a query only on reads", () => {
    for (const r of table) {
      if ("body" in r) expect(r.method, r.name).not.toBe("GET");
      if ("query" in r) expect(r.method, r.name).toBe("GET");
    }
  });

  it("leaves exactly the login, reset, session, onboarding and health routes public (ARCHITECTURE §10.1; onboarding §10.3, INV-78)", () => {
    const publicRoutes = table.filter((r) => r.public === true).map((r) => `${r.method} ${r.path}`);
    expect(publicRoutes.sort()).toEqual(
      [
        "POST /api/auth/login",
        "POST /api/auth/reset-defaults",
        "GET /api/auth/session",
        "GET /api/onboarding",
        "POST /api/onboarding",
        "GET /api/health",
      ].sort(),
    );
  });
});

// The endpoints of each resource SPEC-04 §4.3 lists, by route name.
const RESOURCES: [string, string[]][] = [
  ["auth", ["auth.login", "auth.logout", "auth.session", "auth.changePassword", "auth.resetDefaults"]],
  ["onboarding", ["onboarding.status", "onboarding.complete"]],
  ["supplier", ["supplier.get", "supplier.update"]],
  [
    "settings",
    [
      "settings.get",
      "settings.update",
      "settings.bhelPassword",
      "settings.setBhelPassword",
      "settings.clearBhelPassword",
    ],
  ],
  ["buyers", ["buyers.list", "buyers.create", "buyers.update", "buyers.delete"]],
  [
    "po",
    [
      "po.list",
      "po.stats",
      "po.detail",
      "po.linked",
      "po.upload",
      "po.create",
      "po.update",
      "po.delete",
      "po.setManualDispatched",
    ],
  ],
  ["srv", ["srv.list", "srv.byPo", "srv.detail", "srv.stats", "srv.upload", "srv.delete"]],
  [
    "dc",
    [
      "dc.list",
      "dc.detail",
      "dc.stats",
      "dc.dispatchable",
      "dc.create",
      "dc.update",
      "dc.delete",
      "dc.excel",
      "dc.gcExcel",
      "dc.export",
      "dc.numberCheck",
    ],
  ],
  [
    "invoice",
    [
      "invoice.list",
      "invoice.detail",
      "invoice.stats",
      "invoice.previewDc",
      "invoice.previewPo",
      "invoice.create",
      "invoice.update",
      "invoice.delete",
      "invoice.excel",
      "invoice.export",
      "invoice.numberCheck",
    ],
  ],
  [
    "reports",
    [
      "reports.poRegisterExport",
      "reports.dcRegisterExport",
      "reports.invoiceRegisterExport",
      "reports.pending",
      "reports.pendingExport",
      "reports.reconciliation",
      "reports.reconciliationExport",
      "reports.exportSelected",
      "reports.guaranteeCertificateExport",
    ],
  ],
  ["delivery tracker", ["deliveryTracker.list", "deliveryTracker.stats", "deliveryTracker.export"]],
  ["flags", ["flags.list", "flags.stats", "flags.acknowledge"]],
  ["audit", ["audit.list"]],
  ["jobs", ["jobs.start", "jobs.list", "jobs.detail", "jobs.cancel", "jobs.stage"]],
  ["bhel session", ["bhel.start", "bhel.captcha", "bhel.otp", "bhel.close"]],
  ["search", ["search.query"]],
  ["dashboard", ["dashboard.summary", "dashboard.activity"]],
  ["health", ["health.get"]],
];

describe("every ARCHITECTURE §9 resource has its routes", () => {
  it("has no route beyond those", () => {
    expect(Object.keys(routes).sort()).toEqual(RESOURCES.flatMap(([, names]) => names).sort());
  });
});

describe("dropped legacy endpoints are absent (INV-87, INV-83)", () => {
  const paths = table.map((r) => r.path);

  it.each([
    ["procurement and analytics", /\/(analytics|procurement|intelligence|quality)\b/],
    ["dashboard insights and forecast", /\/(insights|forecast)\b/],
    ["the daily-dispatch report", /daily-dispatch/],
    ["HTTP reconcile-all", /reconcile/],
    ["download-folder preferences", /download-folder/],
    ["health aliases", /\/(ping|ready|live|metrics)\b|\/health\/./],
    ["multi-PO invoices", /po-numbers|multi-po/],
  ])("%s", (_name, pattern) => {
    expect(paths.filter((p) => pattern.test(p))).toEqual([]);
  });

  it("has no audit delete or prune (INV-83)", () => {
    expect(table.filter((r) => r.path.startsWith("/api/audit")).map((r) => r.method)).toEqual(["GET"]);
  });

  it("starts the recompute only as a job (ARCHITECTURE §9)", () => {
    expect(routes["jobs.start"].body.options.map((o) => o.shape.type.value)).toEqual([
      "po.import-folder",
      "srv.import-folder",
      "po.scrape",
      "srv.scrape",
      "recompute-all",
      "backup",
    ]);
  });
});

describe("no float on the wire (C3)", () => {
  /** JSON-schema paths whose type is a float `number`. */
  function floatPaths(node: unknown, path: string): string[] {
    if (typeof node !== "object" || node === null) return [];
    const own = (node as { type?: unknown }).type === "number" ? [path] : [];
    return own.concat(Object.entries(node).flatMap(([key, child]) => floatPaths(child, `${path}.${key}`)));
  }

  it("has no float in any quantity, money or other value of any route; only the page size enum is a number", () => {
    const found = table.flatMap((r) =>
      (["params", "query", "body", "response"] as const).flatMap((part) => {
        const schema = r[part];
        if (!schema || schema === "file") return [];
        return (["input", "output"] as const).flatMap((io) =>
          floatPaths(z.toJSONSchema(schema, { io, unrepresentable: "any" }), `${r.name}.${part}`),
        );
      }),
    );
    expect(found.filter((p) => !p.endsWith(".properties.pageSize"))).toEqual([]);
  });
});
