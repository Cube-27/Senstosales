// `createServices(deps)` (SPEC-07 §4.1): every use case, callable without HTTP. Routes call these; later adapters
// (MCP, Telegram) would too.
import type { Db } from "@senstosales/db";

import type { Clock } from "../ports/clock.ts";
import type { Jobs } from "../ports/jobs.ts";
import { createAuthService } from "./auth.ts";
import { createBuyersService } from "./buyers.ts";
import { jobsService } from "./jobs.ts";
import { createOnboardingService } from "./onboarding.ts";
import { createSecretsService } from "./secrets.ts";
import { createSettingsService } from "./settings.ts";
import { createSupplierService } from "./supplier.ts";

export interface ServiceDeps {
  readonly db: Db;
  readonly clock: Clock;
  readonly jobs: Jobs;
}

export function createServices(deps: ServiceDeps) {
  return {
    auth: createAuthService(deps),
    onboarding: createOnboardingService(deps),
    supplier: createSupplierService(deps),
    settings: createSettingsService(deps),
    buyers: createBuyersService(deps),
    secrets: createSecretsService(deps),
    jobs: jobsService(deps),
  };
}

export type Services = ReturnType<typeof createServices>;
