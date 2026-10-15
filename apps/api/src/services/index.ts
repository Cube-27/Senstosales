// `createServices(deps)` (SPEC-07 §4.1): every use case, callable without HTTP. Routes call these; later adapters
// (MCP, Telegram) would too.
import type { Db } from "@senstosales/db";

import type { Clock } from "../ports/clock.ts";
import type { Jobs } from "../ports/jobs.ts";
import type { Storage } from "../ports/storage.ts";
import { auditService } from "./audit.ts";
import { createAuthService } from "./auth.ts";
import { createBuyersService } from "./buyers.ts";
import { dashboardService } from "./dashboard.ts";
import { deliveryTrackerService } from "./delivery-tracker.ts";
import { dcService } from "./dc.ts";
import { flagsService } from "./flags.ts";
import { folderImportService } from "./folder-import.ts";
import { invoiceService } from "./invoice.ts";
import { invoicePreviewService } from "./invoice-preview.ts";
import { jobsService } from "./jobs.ts";
import { poIngestService } from "./po-ingest.ts";
import { createOnboardingService } from "./onboarding.ts";
import { poService } from "./po.ts";
import { poManualQtyService } from "./po-manual-qty.ts";
import { reportsService } from "./reports.ts";
import { registersService } from "./registers.ts";
import { searchService } from "./search.ts";
import { createSecretsService } from "./secrets.ts";
import { createSettingsService } from "./settings.ts";
import { srvIngestService } from "./srv-ingest.ts";
import { srvService } from "./srv.ts";
import { createSupplierService, supplierRef, type SupplierRef } from "./supplier.ts";

export interface ServiceDeps {
  readonly db: Db;
  readonly clock: Clock;
  readonly jobs: Jobs;
  readonly storage: Storage;
}

/** What the services of the supplier's data take: one shared supplier id. */
export interface SupplierDeps extends ServiceDeps {
  readonly supplierId: SupplierRef;
}

export function createServices(deps: ServiceDeps) {
  const withSupplier: SupplierDeps = { ...deps, supplierId: supplierRef(deps.db) };
  const tracker = deliveryTrackerService(deps);
  return {
    auth: createAuthService(deps),
    onboarding: createOnboardingService(withSupplier),
    supplier: createSupplierService(withSupplier),
    settings: createSettingsService(withSupplier),
    buyers: createBuyersService(withSupplier),
    secrets: createSecretsService(withSupplier),
    jobs: jobsService(deps),
    folderImport: folderImportService(deps),
    po: poService(withSupplier),
    poManualQty: poManualQtyService(deps),
    poIngest: poIngestService(deps),
    srvIngest: srvIngestService(deps),
    srv: srvService(deps),
    dc: dcService(withSupplier),
    invoice: invoiceService(withSupplier),
    invoicePreview: invoicePreviewService(withSupplier),
    flags: flagsService(deps),
    audit: auditService(deps),
    deliveryTracker: tracker,
    reports: reportsService(deps),
    dashboard: dashboardService({ ...deps, tracker }),
    search: searchService(deps),
    registers: registersService(deps),
  };
}

export type Services = ReturnType<typeof createServices>;
