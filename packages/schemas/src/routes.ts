// The route table: the one list of endpoints (INV-101). The API mounts each entry and validates with its schemas;
// the web client and the OpenAPI file are typed and generated from it (ARCHITECTURE §9). Paths are new; only the UI
// routes are frozen (A-2). Dropped legacy endpoints have no entry (INV-87); the audit log has no delete (INV-83).
import { z } from "zod";

import { zDownload, zIdParams, zOk, zPaged, zUploadBody, zUploadResults } from "./api/common.ts";
import {
  zDcCreateBody,
  zDcDetail,
  zDcFilterQuery,
  zDcListQuery,
  zDcListRow,
  zDcStats,
  zDcUpdateBody,
  zDispatchable,
  zNumberCheck,
  zNumberCheckQuery,
  zPoIdParams,
} from "./api/dc.ts";
import { zAcknowledgeBody, zAuditListQuery, zAuditRow, zFlagListQuery, zFlagRow, zFlagStats } from "./api/flags.ts";
import { zActivity, zDashboardQuery, zDashboardSummary, zSearchHit, zSearchQuery } from "./api/home.ts";
import {
  zDcIdParams,
  zInvoiceCreateBody,
  zInvoiceDetail,
  zInvoiceFilterQuery,
  zInvoiceListQuery,
  zInvoiceListRow,
  zInvoicePreview,
  zInvoiceStats,
  zInvoiceUpdateBody,
} from "./api/invoice.ts";
import {
  zBhelSession,
  zBhelStep,
  zCaptchaBody,
  zHealth,
  zJobDetail,
  zJobListQuery,
  zJobStartBody,
  zOtpBody,
  zSessionParams,
  zStageBody,
  zStaged,
} from "./api/jobs.ts";
import {
  zManualDispatchedBody,
  zPoCreateBody,
  zPoDetail,
  zPoItemParams,
  zPoLinked,
  zPoListQuery,
  zPoListRow,
  zPoStats,
  zPoStatsQuery,
  zPoUpdateBody,
} from "./api/po.ts";
import {
  zDcIdQuery,
  zExportSelectedBody,
  zPendingExportQuery,
  zPendingQuery,
  zPendingRow,
  zReconciliationExportQuery,
  zReconciliationQuery,
  zReconciliationRow,
  zRegisterExportQuery,
  zTrackerExportQuery,
  zTrackerQuery,
  zTrackerRow,
  zTrackerStats,
  zTrackerStatsQuery,
} from "./api/reports.ts";
import {
  zSrvByPoQuery,
  zSrvByPoRow,
  zSrvDetail,
  zSrvListQuery,
  zSrvListRow,
  zSrvStats,
  zSrvStatsQuery,
} from "./api/srv.ts";
import {
  zBhelPasswordBody,
  zBhelPasswordStatus,
  zBuyerBody,
  zChangePasswordBody,
  zLoginBody,
  zOnboardingBody,
  zOnboardingStatus,
  zResetDefaultsBody,
  zSession,
  zSettings,
  zSupplierBody,
} from "./api/system.ts";
import { zDc } from "./entities/dc.ts";
import { zFlag } from "./entities/flag.ts";
import { zInvoice } from "./entities/invoice.ts";
import { zJob } from "./entities/job.ts";
import { zPo, zPoItem } from "./entities/po.ts";
import { zBuyer, zSupplier } from "./entities/supplier.ts";

/** One endpoint. `public` routes answer without a session (ARCHITECTURE §10.1); every other one needs it. */
export interface RouteDef {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: `/api/${string}`;
  readonly auth: "public" | "session";
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  /** The 2xx body; `zDownload` for a file. */
  readonly response: z.ZodType;
}

const session = "session";
const open = "public";

export const routes = {
  // Auth and onboarding (SPEC-07). Onboarding runs before the first login, so it is public; the API answers it
  // only while no supplier exists (INV-78).
  "auth.login": { method: "POST", path: "/api/auth/login", auth: open, body: zLoginBody, response: zSession },
  "auth.logout": { method: "POST", path: "/api/auth/logout", auth: session, response: zOk },
  "auth.session": { method: "GET", path: "/api/auth/session", auth: open, response: zSession },
  "auth.changePassword": {
    method: "POST",
    path: "/api/auth/change-password",
    auth: session,
    body: zChangePasswordBody,
    response: zOk,
  },
  "auth.resetDefaults": {
    method: "POST",
    path: "/api/auth/reset-defaults",
    auth: open,
    body: zResetDefaultsBody,
    response: zOk,
  },
  "onboarding.status": { method: "GET", path: "/api/onboarding", auth: open, response: zOnboardingStatus },
  "onboarding.complete": {
    method: "POST",
    path: "/api/onboarding",
    auth: open,
    body: zOnboardingBody,
    response: zSupplier,
  },

  // Supplier, settings, BHEL password (write-only, INV-81) and buyers (SPEC-07).
  "supplier.get": { method: "GET", path: "/api/supplier", auth: session, response: zSupplier },
  "supplier.update": { method: "PUT", path: "/api/supplier", auth: session, body: zSupplierBody, response: zSupplier },
  "settings.get": { method: "GET", path: "/api/settings", auth: session, response: zSettings },
  "settings.update": { method: "PUT", path: "/api/settings", auth: session, body: zSettings, response: zSettings },
  "settings.bhelPassword": {
    method: "GET",
    path: "/api/settings/bhel-password",
    auth: session,
    response: zBhelPasswordStatus,
  },
  "settings.setBhelPassword": {
    method: "PUT",
    path: "/api/settings/bhel-password",
    auth: session,
    body: zBhelPasswordBody,
    response: zBhelPasswordStatus,
  },
  "settings.clearBhelPassword": {
    method: "DELETE",
    path: "/api/settings/bhel-password",
    auth: session,
    response: zBhelPasswordStatus,
  },
  "buyers.list": { method: "GET", path: "/api/buyers", auth: session, response: z.array(zBuyer) },
  "buyers.create": { method: "POST", path: "/api/buyers", auth: session, body: zBuyerBody, response: zBuyer },
  "buyers.update": {
    method: "PUT",
    path: "/api/buyers/:id",
    auth: session,
    params: zIdParams,
    body: zBuyerBody,
    response: zBuyer,
  },
  "buyers.delete": { method: "DELETE", path: "/api/buyers/:id", auth: session, params: zIdParams, response: zOk },

  // POs (SPEC-08 upload, SPEC-10 the rest).
  "po.list": { method: "GET", path: "/api/po", auth: session, query: zPoListQuery, response: zPaged(zPoListRow) },
  "po.stats": { method: "GET", path: "/api/po/stats", auth: session, query: zPoStatsQuery, response: zPoStats },
  "po.detail": { method: "GET", path: "/api/po/:id", auth: session, params: zIdParams, response: zPoDetail },
  "po.linked": { method: "GET", path: "/api/po/:id/linked", auth: session, params: zIdParams, response: zPoLinked },
  "po.upload": { method: "POST", path: "/api/po/upload", auth: session, body: zUploadBody, response: zUploadResults },
  "po.create": { method: "POST", path: "/api/po", auth: session, body: zPoCreateBody, response: zPo },
  "po.update": {
    method: "PUT",
    path: "/api/po/:id",
    auth: session,
    params: zIdParams,
    body: zPoUpdateBody,
    response: zPo,
  },
  "po.delete": { method: "DELETE", path: "/api/po/:id", auth: session, params: zIdParams, response: zOk },
  "po.setManualDispatched": {
    method: "PUT",
    path: "/api/po/:id/items/:itemId/manual-dispatched",
    auth: session,
    params: zPoItemParams,
    body: zManualDispatchedBody,
    response: zPoItem,
  },

  // SRVs (SPEC-08 upload, SPEC-10 the rest). Delete is never blocked (INV-35).
  "srv.list": { method: "GET", path: "/api/srv", auth: session, query: zSrvListQuery, response: zPaged(zSrvListRow) },
  "srv.byPo": {
    method: "GET",
    path: "/api/srv/by-po",
    auth: session,
    query: zSrvByPoQuery,
    response: zPaged(zSrvByPoRow),
  },
  "srv.stats": { method: "GET", path: "/api/srv/stats", auth: session, query: zSrvStatsQuery, response: zSrvStats },
  "srv.detail": { method: "GET", path: "/api/srv/:id", auth: session, params: zIdParams, response: zSrvDetail },
  "srv.upload": {
    method: "POST",
    path: "/api/srv/upload",
    auth: session,
    body: zUploadBody,
    response: zUploadResults,
  },
  "srv.delete": { method: "DELETE", path: "/api/srv/:id", auth: session, params: zIdParams, response: zOk },

  // DCs (SPEC-11; downloads SPEC-12, list CSV SPEC-13).
  "dc.list": { method: "GET", path: "/api/dc", auth: session, query: zDcListQuery, response: zPaged(zDcListRow) },
  "dc.stats": { method: "GET", path: "/api/dc/stats", auth: session, query: zDcFilterQuery, response: zDcStats },
  "dc.export": { method: "GET", path: "/api/dc/export", auth: session, query: zDcFilterQuery, response: zDownload },
  "dc.numberCheck": {
    method: "GET",
    path: "/api/dc/number-check",
    auth: session,
    query: zNumberCheckQuery,
    response: zNumberCheck,
  },
  "dc.dispatchable": {
    method: "GET",
    path: "/api/dc/dispatchable/:poId",
    auth: session,
    params: zPoIdParams,
    response: zDispatchable,
  },
  "dc.detail": { method: "GET", path: "/api/dc/:id", auth: session, params: zIdParams, response: zDcDetail },
  "dc.create": { method: "POST", path: "/api/dc", auth: session, body: zDcCreateBody, response: zDc },
  "dc.update": {
    method: "PUT",
    path: "/api/dc/:id",
    auth: session,
    params: zIdParams,
    body: zDcUpdateBody,
    response: zDc,
  },
  "dc.delete": { method: "DELETE", path: "/api/dc/:id", auth: session, params: zIdParams, response: zOk },
  "dc.excel": { method: "GET", path: "/api/dc/:id/excel", auth: session, params: zIdParams, response: zDownload },
  "dc.gcExcel": { method: "GET", path: "/api/dc/:id/gc-excel", auth: session, params: zIdParams, response: zDownload },

  // Invoices (SPEC-11; download SPEC-12, list CSV SPEC-13).
  "invoice.list": {
    method: "GET",
    path: "/api/invoice",
    auth: session,
    query: zInvoiceListQuery,
    response: zPaged(zInvoiceListRow),
  },
  "invoice.stats": {
    method: "GET",
    path: "/api/invoice/stats",
    auth: session,
    query: zInvoiceFilterQuery,
    response: zInvoiceStats,
  },
  "invoice.export": {
    method: "GET",
    path: "/api/invoice/export",
    auth: session,
    query: zInvoiceFilterQuery,
    response: zDownload,
  },
  "invoice.numberCheck": {
    method: "GET",
    path: "/api/invoice/number-check",
    auth: session,
    query: zNumberCheckQuery,
    response: zNumberCheck,
  },
  "invoice.previewDc": {
    method: "GET",
    path: "/api/invoice/preview/dc/:dcId",
    auth: session,
    params: zDcIdParams,
    response: zInvoicePreview,
  },
  "invoice.previewPo": {
    method: "GET",
    path: "/api/invoice/preview/po/:poId",
    auth: session,
    params: zPoIdParams,
    response: zInvoicePreview,
  },
  "invoice.detail": {
    method: "GET",
    path: "/api/invoice/:id",
    auth: session,
    params: zIdParams,
    response: zInvoiceDetail,
  },
  "invoice.create": {
    method: "POST",
    path: "/api/invoice",
    auth: session,
    body: zInvoiceCreateBody,
    response: zInvoice,
  },
  "invoice.update": {
    method: "PUT",
    path: "/api/invoice/:id",
    auth: session,
    params: zIdParams,
    body: zInvoiceUpdateBody,
    response: zInvoice,
  },
  "invoice.delete": { method: "DELETE", path: "/api/invoice/:id", auth: session, params: zIdParams, response: zOk },
  "invoice.excel": {
    method: "GET",
    path: "/api/invoice/:id/excel",
    auth: session,
    params: zIdParams,
    response: zDownload,
  },

  // Reports and exports (SPEC-13): the two /reports tabs, their exports, the registers and the GC report.
  "reports.pending": {
    method: "GET",
    path: "/api/reports/pending",
    auth: session,
    query: zPendingQuery,
    response: zPaged(zPendingRow),
  },
  "reports.pendingExport": {
    method: "GET",
    path: "/api/reports/pending/export",
    auth: session,
    query: zPendingExportQuery,
    response: zDownload,
  },
  "reports.reconciliation": {
    method: "GET",
    path: "/api/reports/reconciliation",
    auth: session,
    query: zReconciliationQuery,
    response: zPaged(zReconciliationRow),
  },
  "reports.reconciliationExport": {
    method: "GET",
    path: "/api/reports/reconciliation/export",
    auth: session,
    query: zReconciliationExportQuery,
    response: zDownload,
  },
  "reports.exportSelected": {
    method: "POST",
    path: "/api/reports/export-selected",
    auth: session,
    body: zExportSelectedBody,
    response: zDownload,
  },
  "reports.poRegisterExport": {
    method: "GET",
    path: "/api/reports/po-register/export",
    auth: session,
    query: zRegisterExportQuery,
    response: zDownload,
  },
  "reports.dcRegisterExport": {
    method: "GET",
    path: "/api/reports/dc-register/export",
    auth: session,
    query: zRegisterExportQuery,
    response: zDownload,
  },
  "reports.invoiceRegisterExport": {
    method: "GET",
    path: "/api/reports/invoice-register/export",
    auth: session,
    query: zRegisterExportQuery,
    response: zDownload,
  },
  "reports.guaranteeCertificateExport": {
    method: "GET",
    path: "/api/reports/guarantee-certificate/export",
    auth: session,
    query: zDcIdQuery,
    response: zDownload,
  },

  // Delivery tracker (SPEC-10 list and stats, SPEC-13 export).
  "deliveryTracker.list": {
    method: "GET",
    path: "/api/delivery-tracker",
    auth: session,
    query: zTrackerQuery,
    response: zPaged(zTrackerRow),
  },
  "deliveryTracker.stats": {
    method: "GET",
    path: "/api/delivery-tracker/stats",
    auth: session,
    query: zTrackerStatsQuery,
    response: zTrackerStats,
  },
  "deliveryTracker.export": {
    method: "GET",
    path: "/api/delivery-tracker/export",
    auth: session,
    query: zTrackerExportQuery,
    response: zDownload,
  },

  // Flags and the read-only audit ledger (SPEC-10).
  "flags.list": { method: "GET", path: "/api/flags", auth: session, query: zFlagListQuery, response: zPaged(zFlagRow) },
  "flags.stats": { method: "GET", path: "/api/flags/stats", auth: session, response: zFlagStats },
  "flags.acknowledge": {
    method: "POST",
    path: "/api/flags/:id/acknowledge",
    auth: session,
    params: zIdParams,
    body: zAcknowledgeBody,
    response: zFlag,
  },
  "audit.list": {
    method: "GET",
    path: "/api/audit",
    auth: session,
    query: zAuditListQuery,
    response: zPaged(zAuditRow),
  },

  // Jobs (SPEC-08): folder import, scrape, recompute-all and backup all start here.
  "jobs.start": { method: "POST", path: "/api/jobs", auth: session, body: zJobStartBody, response: zJob },
  "jobs.list": { method: "GET", path: "/api/jobs", auth: session, query: zJobListQuery, response: zPaged(zJob) },
  "jobs.stage": { method: "POST", path: "/api/jobs/staging", auth: session, body: zStageBody, response: zStaged },
  "jobs.detail": { method: "GET", path: "/api/jobs/:id", auth: session, params: zIdParams, response: zJobDetail },
  "jobs.cancel": { method: "POST", path: "/api/jobs/:id/cancel", auth: session, params: zIdParams, response: zJob },

  // BHEL login wizard (SPEC-19): captcha, then OTP, then `jobs.start` with the session.
  "bhel.start": { method: "POST", path: "/api/bhel/session", auth: session, response: zBhelSession },
  "bhel.captcha": {
    method: "POST",
    path: "/api/bhel/session/:sessionId/captcha",
    auth: session,
    params: zSessionParams,
    body: zCaptchaBody,
    response: zBhelStep,
  },
  "bhel.otp": {
    method: "POST",
    path: "/api/bhel/session/:sessionId/otp",
    auth: session,
    params: zSessionParams,
    body: zOtpBody,
    response: zBhelStep,
  },
  "bhel.close": {
    method: "DELETE",
    path: "/api/bhel/session/:sessionId",
    auth: session,
    params: zSessionParams,
    response: zOk,
  },

  // Search, dashboard and health (SPEC-10, SPEC-07).
  "search.query": {
    method: "GET",
    path: "/api/search",
    auth: session,
    query: zSearchQuery,
    response: z.array(zSearchHit),
  },
  "dashboard.summary": {
    method: "GET",
    path: "/api/dashboard/summary",
    auth: session,
    query: zDashboardQuery,
    response: zDashboardSummary,
  },
  "dashboard.activity": {
    method: "GET",
    path: "/api/dashboard/activity",
    auth: session,
    response: z.array(zActivity),
  },
  "health.get": { method: "GET", path: "/api/health", auth: open, response: zHealth },
} as const satisfies Record<string, RouteDef>;
