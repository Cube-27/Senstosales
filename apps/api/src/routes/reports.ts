// The /reports tabs' lists (SPEC-13 PR 5, the daily dispatch tab A-16 reversed), their exports and export-selected (SPEC-13 PR 4).
import type { Handlers } from "../app.ts";
import type { ReportsService } from "../services/reports.ts";

export function reportsRoutes(reports: ReportsService) {
  return {
    "reports.pending": ({ query }) => reports.pending(query),
    "reports.reconciliation": ({ query }) => reports.reconciliation(query),
    "reports.dispatch": ({ query }) => reports.dispatch(query),
    "reports.pendingExport": ({ query }) => reports.pendingExport(query),
    "reports.reconciliationExport": ({ query }) => reports.reconciliationExport(query),
    "reports.dispatchExport": ({ query }) => reports.dispatchExport(query),
    "reports.exportSelected": ({ body }) => reports.exportSelected(body),
    "reports.guaranteeCertificateExport": ({ query }) => reports.guaranteeCertificate(query),
  } satisfies Handlers;
}
