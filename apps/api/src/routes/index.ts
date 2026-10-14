// The handlers of every route backed by `createServices`; health takes its own deps.
import type { Handlers } from "../app.ts";
import type { Services } from "../services/index.ts";
import { authRoutes } from "./auth.ts";
import { buyersRoutes } from "./buyers.ts";
import { jobsRoutes } from "./jobs.ts";
import { onboardingRoutes } from "./onboarding.ts";
import { poRoutes } from "./po.ts";
import { settingsRoutes } from "./settings.ts";
import { supplierRoutes } from "./supplier.ts";

export function apiRoutes(services: Services): Handlers {
  return {
    ...authRoutes(services.auth),
    ...onboardingRoutes(services),
    ...supplierRoutes(services),
    ...settingsRoutes(services),
    ...buyersRoutes(services),
    ...jobsRoutes(services.jobs),
    ...poRoutes(services.po),
  };
}
