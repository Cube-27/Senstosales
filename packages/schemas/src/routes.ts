// The route table: the one list of endpoints (INV-101). The API mounts each entry and validates with its schemas;
// the web client and the OpenAPI file are typed and generated from it (ARCHITECTURE §9). Paths are new; only the UI
// routes are frozen (A-2). Dropped legacy endpoints have no entry (INV-87); the audit log has no delete (INV-83).
import { z } from "zod";

import { zOk, zPaged, zRangeFilters, zUnpaged, zUploadBody, zUploadResults } from "./api/common.ts";
import * as dc from "./api/dc.ts";
import * as flags from "./api/flags.ts";
import * as home from "./api/home.ts";
import * as invoice from "./api/invoice.ts";
import * as jobs from "./api/jobs.ts";
import * as po from "./api/po.ts";
import * as reports from "./api/reports.ts";
import * as srv from "./api/srv.ts";
import * as sys from "./api/system.ts";
import { zAuditEntry } from "./entities/audit.ts";
import { zDc } from "./entities/dc.ts";
import { zFlag } from "./entities/flag.ts";
import { zInvoice } from "./entities/invoice.ts";
import { zJob } from "./entities/job.ts";
import { zPo, zPoItem } from "./entities/po.ts";
import { zBuyer, zSupplier } from "./entities/supplier.ts";
import { zId } from "./primitives.ts";

/** One endpoint as the table declares it. Every `:param` in a path is an id; `routes` adds its schema. */
interface RouteSpec {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: `/api/${string}`;
  /** Answers without a session (ARCHITECTURE §10.1); every other route needs one. */
  readonly public?: true;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  /** The 2xx JSON body, or `"file"` for a download (Excel, CSV) named by `Content-Disposition`. */
  readonly response: z.ZodType | "file";
}

export interface RouteDef extends RouteSpec {
  readonly params?: z.ZodObject;
}

/** The `:name` segments of a path. */
export type PathParams<P extends string> = P extends `${string}:${infer K}/${infer Rest}`
  ? K | PathParams<Rest>
  : P extends `${string}:${infer K}`
    ? K
    : never;

type WithParams<R extends RouteSpec> = [PathParams<R["path"]>] extends [never]
  ? R
  : R & { readonly params: z.ZodObject<{ [K in PathParams<R["path"]>]: typeof zId }> };

function withParams<T extends Record<string, RouteSpec>>(table: T): { [N in keyof T]: WithParams<T[N]> } {
  const entries = Object.entries(table).map(([name, def]) => {
    const keys = [...def.path.matchAll(/:(\w+)/g)].map((m) => [m[1], zId]);
    return [name, keys.length > 0 ? { ...def, params: z.object(Object.fromEntries(keys)) } : def];
  });
  return Object.fromEntries(entries) as { [N in keyof T]: WithParams<T[N]> };
}

const file = "file";
const rangeQuery = z.object(zRangeFilters);

export const routes = withParams({
  // Auth and onboarding (SPEC-07). Onboarding runs before the first login, so it is public; the API answers it
  // only while no supplier exists (INV-78).
  "auth.login": { method: "POST", path: "/api/auth/login", public: true, body: sys.zLoginBody, response: sys.zSession },
  "auth.logout": { method: "POST", path: "/api/auth/logout", response: zOk },
  "auth.session": { method: "GET", path: "/api/auth/session", public: true, response: sys.zSession },
  "auth.changePassword": {
    method: "POST",
    path: "/api/auth/change-password",
    body: sys.zChangePasswordBody,
    response: zOk,
  },
  "auth.resetDefaults": {
    method: "POST",
    path: "/api/auth/reset-defaults",
    public: true,
    body: sys.zResetDefaultsBody,
    response: zOk,
  },
  "onboarding.status": { method: "GET", path: "/api/onboarding", public: true, response: sys.zOnboardingStatus },
  "onboarding.complete": {
    method: "POST",
    path: "/api/onboarding",
    public: true,
    body: sys.zOnboardingBody,
    response: zSupplier,
  },

  // Supplier, settings, BHEL password (write-only, INV-81) and buyers (SPEC-07).
  "supplier.get": { method: "GET", path: "/api/supplier", response: zSupplier },
  "supplier.update": { method: "PUT", path: "/api/supplier", body: sys.zSupplierBody, response: zSupplier },
  "settings.get": { method: "GET", path: "/api/settings", response: sys.zSettings },
  "settings.update": { method: "PUT", path: "/api/settings", body: sys.zSettings, response: sys.zSettings },
  "settings.bhelPassword": { method: "GET", path: "/api/settings/bhel-password", response: sys.zBhelPasswordStatus },
  "settings.setBhelPassword": {
    method: "PUT",
    path: "/api/settings/bhel-password",
    body: sys.zBhelPasswordBody,
    response: sys.zBhelPasswordStatus,
  },
  "settings.clearBhelPassword": {
    method: "DELETE",
    path: "/api/settings/bhel-password",
    response: sys.zBhelPasswordStatus,
  },
  // Backups and restore (SPEC-21); Backup now is `jobs.start` with the `backup` type.
  "backups.list": { method: "GET", path: "/api/backups", response: z.array(sys.zBackup) },
  "backups.restore": { method: "POST", path: "/api/backups/restore", body: sys.zRestoreBody, response: sys.zRestored },
  "buyers.list": { method: "GET", path: "/api/buyers", response: z.array(zBuyer) },
  "buyers.create": { method: "POST", path: "/api/buyers", body: sys.zBuyerBody, response: zBuyer },
  "buyers.update": { method: "PUT", path: "/api/buyers/:id", body: sys.zBuyerBody, response: zBuyer },
  "buyers.delete": { method: "DELETE", path: "/api/buyers/:id", response: zOk },

  // POs (SPEC-08 upload, SPEC-10 the rest).
  "po.list": { method: "GET", path: "/api/po", query: po.zPoListQuery, response: zPaged(po.zPoListRow) },
  "po.stats": { method: "GET", path: "/api/po/stats", query: po.zPoStatsQuery, response: po.zPoStats },
  "po.detail": { method: "GET", path: "/api/po/:id", response: po.zPoDetail },
  "po.linked": { method: "GET", path: "/api/po/:id/linked", response: po.zPoDetail.shape.linked },
  "po.upload": { method: "POST", path: "/api/po/upload", body: zUploadBody, response: zUploadResults },
  "po.create": { method: "POST", path: "/api/po", body: po.zPoCreateBody, response: zPo },
  "po.update": { method: "PUT", path: "/api/po/:id", body: po.zPoUpdateBody, response: zPo },
  "po.delete": { method: "DELETE", path: "/api/po/:id", response: zOk },
  "po.setManualDispatched": {
    method: "PUT",
    path: "/api/po/:id/items/:itemId/manual-dispatched",
    body: po.zManualDispatchedBody,
    response: zPoItem,
  },

  // SRVs (SPEC-08 upload, SPEC-10 the rest). Delete is never blocked (INV-35).
  "srv.list": { method: "GET", path: "/api/srv", query: srv.zSrvListQuery, response: zPaged(srv.zSrvListRow) },
  "srv.byPo": { method: "GET", path: "/api/srv/by-po", query: srv.zSrvByPoQuery, response: zPaged(srv.zSrvByPoRow) },
  "srv.stats": { method: "GET", path: "/api/srv/stats", query: srv.zSrvStatsQuery, response: srv.zSrvStats },
  "srv.detail": { method: "GET", path: "/api/srv/:id", response: srv.zSrvDetail },
  "srv.upload": { method: "POST", path: "/api/srv/upload", body: zUploadBody, response: zUploadResults },
  "srv.delete": { method: "DELETE", path: "/api/srv/:id", response: zOk },

  // DCs (SPEC-11; downloads SPEC-12, list CSV SPEC-13).
  "dc.list": { method: "GET", path: "/api/dc", query: dc.zDcListQuery, response: zPaged(dc.zDcListRow) },
  "dc.stats": { method: "GET", path: "/api/dc/stats", query: rangeQuery, response: dc.zDcStats },
  "dc.export": { method: "GET", path: "/api/dc/export", query: zUnpaged(dc.zDcListQuery), response: file },
  "dc.numberCheck": {
    method: "GET",
    path: "/api/dc/number-check",
    query: dc.zNumberCheckQuery,
    response: dc.zNumberCheck,
  },
  "dc.dispatchable": { method: "GET", path: "/api/dc/dispatchable/:poId", response: dc.zDispatchable },
  "dc.detail": { method: "GET", path: "/api/dc/:id", response: dc.zDcDetail },
  "dc.create": { method: "POST", path: "/api/dc", body: dc.zDcCreateBody, response: zDc },
  "dc.update": { method: "PUT", path: "/api/dc/:id", body: dc.zDcUpdateBody, response: zDc },
  "dc.delete": { method: "DELETE", path: "/api/dc/:id", response: zOk },
  "dc.excel": { method: "GET", path: "/api/dc/:id/excel", response: file },
  "dc.gcExcel": { method: "GET", path: "/api/dc/:id/gc-excel", response: file },

  // Invoices (SPEC-11; download SPEC-12, list CSV SPEC-13).
  "invoice.list": {
    method: "GET",
    path: "/api/invoice",
    query: invoice.zInvoiceListQuery,
    response: zPaged(invoice.zInvoiceListRow),
  },
  "invoice.stats": { method: "GET", path: "/api/invoice/stats", query: rangeQuery, response: invoice.zInvoiceStats },
  "invoice.export": {
    method: "GET",
    path: "/api/invoice/export",
    query: zUnpaged(invoice.zInvoiceListQuery),
    response: file,
  },
  "invoice.numberCheck": {
    method: "GET",
    path: "/api/invoice/number-check",
    query: dc.zNumberCheckQuery,
    response: dc.zNumberCheck,
  },
  "invoice.previewDc": { method: "GET", path: "/api/invoice/preview/dc/:dcId", response: invoice.zInvoicePreview },
  "invoice.previewPo": { method: "GET", path: "/api/invoice/preview/po/:poId", response: invoice.zInvoicePreview },
  "invoice.detail": { method: "GET", path: "/api/invoice/:id", response: invoice.zInvoiceDetail },
  "invoice.create": { method: "POST", path: "/api/invoice", body: invoice.zInvoiceCreateBody, response: zInvoice },
  "invoice.update": { method: "PUT", path: "/api/invoice/:id", body: invoice.zInvoiceUpdateBody, response: zInvoice },
  "invoice.delete": { method: "DELETE", path: "/api/invoice/:id", response: zOk },
  "invoice.excel": { method: "GET", path: "/api/invoice/:id/excel", response: file },

  // Reports and exports (SPEC-13): the three /reports tabs, their exports, the registers and the GC report. Exports
  // keep the tab's filters and sort but are not paged (INV-99).
  "reports.pending": {
    method: "GET",
    path: "/api/reports/pending",
    query: reports.zPendingQuery,
    response: zPaged(reports.zPendingRow),
  },
  "reports.pendingExport": {
    method: "GET",
    path: "/api/reports/pending/export",
    query: zUnpaged(reports.zPendingQuery),
    response: file,
  },
  "reports.reconciliation": {
    method: "GET",
    path: "/api/reports/reconciliation",
    query: reports.zReconciliationQuery,
    response: zPaged(reports.zReconciliationRow),
  },
  "reports.reconciliationExport": {
    method: "GET",
    path: "/api/reports/reconciliation/export",
    query: zUnpaged(reports.zReconciliationQuery),
    response: file,
  },
  "reports.dispatch": {
    method: "GET",
    path: "/api/reports/daily-dispatch",
    query: reports.zDispatchQuery,
    response: zPaged(reports.zDispatchRow),
  },
  "reports.dispatchExport": {
    method: "GET",
    path: "/api/reports/daily-dispatch/export",
    query: zUnpaged(reports.zDispatchQuery),
    response: file,
  },
  "reports.exportSelected": {
    method: "POST",
    path: "/api/reports/export-selected",
    body: reports.zExportSelectedBody,
    response: file,
  },
  "reports.poRegisterExport": {
    method: "GET",
    path: "/api/reports/po-register/export",
    query: reports.zRegisterExportQuery,
    response: file,
  },
  "reports.dcRegisterExport": {
    method: "GET",
    path: "/api/reports/dc-register/export",
    query: reports.zRegisterExportQuery,
    response: file,
  },
  "reports.invoiceRegisterExport": {
    method: "GET",
    path: "/api/reports/invoice-register/export",
    query: reports.zRegisterExportQuery,
    response: file,
  },
  "reports.guaranteeCertificateExport": {
    method: "GET",
    path: "/api/reports/guarantee-certificate/export",
    query: reports.zDcIdQuery,
    response: file,
  },

  // Delivery tracker (SPEC-10 list and stats, SPEC-13 export).
  "deliveryTracker.list": {
    method: "GET",
    path: "/api/delivery-tracker",
    query: reports.zTrackerQuery,
    response: zPaged(reports.zTrackerRow),
  },
  "deliveryTracker.stats": {
    method: "GET",
    path: "/api/delivery-tracker/stats",
    query: reports.zTrackerStatsQuery,
    response: reports.zTrackerStats,
  },
  "deliveryTracker.export": {
    method: "GET",
    path: "/api/delivery-tracker/export",
    query: zUnpaged(reports.zTrackerQuery),
    response: file,
  },

  // Flags and the read-only audit ledger (SPEC-10).
  "flags.list": { method: "GET", path: "/api/flags", query: flags.zFlagListQuery, response: zPaged(flags.zFlagRow) },
  "flags.stats": { method: "GET", path: "/api/flags/stats", response: flags.zFlagStats },
  "flags.acknowledge": {
    method: "POST",
    path: "/api/flags/:id/acknowledge",
    body: flags.zAcknowledgeBody,
    response: zFlag,
  },
  "audit.list": { method: "GET", path: "/api/audit", query: flags.zAuditListQuery, response: zPaged(zAuditEntry) },

  // Jobs (SPEC-08): folder import, scrape, recompute-all and backup all start here.
  "jobs.start": { method: "POST", path: "/api/jobs", body: jobs.zJobStartBody, response: zJob },
  "jobs.list": { method: "GET", path: "/api/jobs", query: jobs.zJobListQuery, response: zPaged(zJob) },
  "jobs.stage": { method: "POST", path: "/api/jobs/staging", body: jobs.zStageBody, response: jobs.zStaged },
  "jobs.detail": { method: "GET", path: "/api/jobs/:id", response: jobs.zJobDetail },
  "jobs.cancel": { method: "POST", path: "/api/jobs/:id/cancel", response: zJob },

  // BHEL login wizard (SPEC-19): captcha, then OTP, then `jobs.start` with the session.
  "bhel.start": { method: "POST", path: "/api/bhel/session", response: jobs.zBhelSession },
  "bhel.captcha": {
    method: "POST",
    path: "/api/bhel/session/:sessionId/captcha",
    body: jobs.zCaptchaBody,
    response: jobs.zBhelStep,
  },
  "bhel.otp": {
    method: "POST",
    path: "/api/bhel/session/:sessionId/otp",
    body: jobs.zOtpBody,
    response: jobs.zBhelStep,
  },
  "bhel.close": { method: "DELETE", path: "/api/bhel/session/:sessionId", response: zOk },

  // Search, dashboard and health (SPEC-10, SPEC-07).
  "search.query": { method: "GET", path: "/api/search", query: home.zSearchQuery, response: z.array(home.zSearchHit) },
  "dashboard.summary": {
    method: "GET",
    path: "/api/dashboard/summary",
    query: home.zDashboardQuery,
    response: home.zDashboardSummary,
  },
  "dashboard.activity": { method: "GET", path: "/api/dashboard/activity", response: z.array(home.zActivity) },
  "health.get": { method: "GET", path: "/api/health", public: true, response: jobs.zHealth },
} as const satisfies Record<string, RouteSpec>);
