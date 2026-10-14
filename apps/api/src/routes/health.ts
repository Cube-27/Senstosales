// `GET /api/health` (SPEC-07 §2, INV-105). Public: the shell reads it before anyone logs in.
import type { Handlers } from "../app.ts";
import type { HealthDeps } from "../services/health.ts";
import { getHealth } from "../services/health.ts";

export const healthRoutes = (deps: HealthDeps): Handlers => ({ "health.get": () => getHealth(deps) });
