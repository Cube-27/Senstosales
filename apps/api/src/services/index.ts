// `createServices(deps)` (SPEC-07 §4.1): every use case, callable without HTTP. Routes call these; later adapters
// (MCP, Telegram) would too.
import type { Db } from "@senstosales/db";

import type { Clock } from "../ports/clock.ts";
import type { Jobs } from "../ports/jobs.ts";
import type { Storage } from "../ports/storage.ts";
import { createAuthService } from "./auth.ts";
import { createBuyersService } from "./buyers.ts";
import { folderImportService } from "./folder-import.ts";
import { jobsService } from "./jobs.ts";
import { poIngestService } from "./po-ingest.ts";
import { createOnboardingService } from "./onboarding.ts";
import { poService } from "./po.ts";
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
    poIngest: poIngestService(deps),
    srvIngest: srvIngestService(deps),
    srv: srvService(deps),
  };
}

export type Services = ReturnType<typeof createServices>;
