// The handlers of every route backed by `createServices`; health takes its own deps.
import type { Handlers } from "../app.ts";
import type { Services } from "../services/index.ts";
import { auditRoutes } from "./audit.ts";
import { authRoutes } from "./auth.ts";
import { buyersRoutes } from "./buyers.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { deliveryTrackerRoutes } from "./delivery-tracker.ts";
import { dcRoutes } from "./dc.ts";
import { flagsRoutes } from "./flags.ts";
import { invoiceRoutes } from "./invoice.ts";
import { jobStagingRoutes, jobsRoutes } from "./jobs.ts";
import { onboardingRoutes } from "./onboarding.ts";
import { poManualQtyRoutes, poRoutes } from "./po.ts";
import { poUploadRoutes } from "./po-upload.ts";
import { reportsRoutes } from "./reports.ts";
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
  };
}
