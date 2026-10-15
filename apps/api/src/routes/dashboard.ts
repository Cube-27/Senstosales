// Dashboard summary and recent activity (SPEC-10 PR 6).
import type { Handlers } from "../app.ts";
import type { DashboardService } from "../services/dashboard.ts";

export function dashboardRoutes(dashboard: DashboardService) {
  return {
    "dashboard.summary": ({ query }) => dashboard.summary(query),
    "dashboard.activity": () => dashboard.activity(),
  } satisfies Handlers;
}
