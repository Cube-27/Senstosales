// The /reports tabs' lists (SPEC-13 PR 5).
import type { Handlers } from "../app.ts";
import type { ReportsService } from "../services/reports.ts";

export function reportsRoutes(reports: ReportsService) {
  return {
    "reports.pending": ({ query }) => reports.pending(query),
    "reports.reconciliation": ({ query }) => reports.reconciliation(query),
  } satisfies Handlers;
}
