// The handlers of every route: those backed by `createServices`, and health and restore (SPEC-21), which take their
// own deps. The route conformance test mounts `allRoutes` as the server does (INV-101).
import type { Handlers } from "../app.ts";
import type { HealthDeps } from "../services/health.ts";
import type { Services } from "../services/index.ts";
import type { RestoreService } from "../services/restore.ts";
import { auditRoutes } from "./audit.ts";
import { authRoutes } from "./auth.ts";
import { bhelSyncRoutes } from "./bhel-sync.ts";
import { buyersRoutes } from "./buyers.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { deliveryTrackerRoutes } from "./delivery-tracker.ts";
import { dcRoutes } from "./dc.ts";
import { documentsRoutes } from "./documents.ts";
import { flagsRoutes } from "./flags.ts";
import { healthRoutes } from "./health.ts";
import { invoiceRoutes } from "./invoice.ts";
import { jobStagingRoutes, jobsRoutes } from "./jobs.ts";
import { onboardingRoutes } from "./onboarding.ts";
import { poManualQtyRoutes, poRoutes } from "./po.ts";
import { poUploadRoutes } from "./po-upload.ts";
import { reportsRoutes } from "./reports.ts";
import { restoreRoutes } from "./restore.ts";
import { registersRoutes } from "./registers.ts";
import { searchRoutes } from "./search.ts";
import { settingsRoutes } from "./settings.ts";
import { srvUploadRoutes } from "./srv-upload.ts";
import { srvRoutes } from "./srv.ts";
import { supplierRoutes } from "./supplier.ts";

export function apiRoutes(services: Services): Handlers {
  return {
    ...authRoutes(services.auth),
    ...onboardingRoutes(services),
    ...supplierRoutes(services),
    ...settingsRoutes(services),
    ...buyersRoutes(services),
    ...jobsRoutes(services.jobs),
    ...jobStagingRoutes(services.folderImport),
    ...(services.bhel && bhelSyncRoutes(services.bhel)),
    ...poRoutes(services.po),
    ...poManualQtyRoutes(services.poManualQty),
    ...poUploadRoutes(services.poIngest),
    ...srvUploadRoutes(services.srvIngest),
    ...srvRoutes(services.srv),
    ...dcRoutes(services.dc),
    ...invoiceRoutes(services.invoice, services.invoicePreview),
    ...flagsRoutes(services.flags),
    ...auditRoutes(services.audit),
    ...deliveryTrackerRoutes(services.deliveryTracker),
    ...reportsRoutes(services.reports),
    ...dashboardRoutes(services.dashboard),
    ...searchRoutes(services.search),
    ...registersRoutes(services.registers),
    ...documentsRoutes(services.documents),
  };
}

/** Every route the server mounts. */
export const allRoutes = (
  services: Services,
  { health, restore }: { health: HealthDeps; restore: RestoreService },
): Handlers => ({
  ...healthRoutes(health),
  ...apiRoutes(services),
  ...restoreRoutes(restore),
});
