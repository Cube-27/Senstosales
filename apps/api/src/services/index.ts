// `createServices(deps)` (SPEC-07 §4.1): every use case, callable without HTTP. Routes call these; later adapters
// (MCP, Telegram) would too.
import type { Db } from "@senstosales/db";

import type { Clock } from "../ports/clock.ts";
import { createAuthService } from "./auth.ts";

export interface ServiceDeps {
  readonly db: Db;
  readonly clock: Clock;
}

export function createServices(deps: ServiceDeps) {
  return { auth: createAuthService(deps) };
}

export type Services = ReturnType<typeof createServices>;
