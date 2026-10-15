// Flags and the read-only audit ledger (SPEC-10 PR 5). The audit log has a list and nothing else (INV-83).
import type { Handlers } from "../app.ts";
import type { AuditService } from "../services/audit.ts";
import type { FlagsService } from "../services/flags.ts";

export function flagsRoutes(flags: FlagsService, audit: AuditService) {
  return {
    "flags.list": ({ query }) => flags.list(query),
    "flags.stats": () => flags.stats(),
    "flags.acknowledge": ({ params, body }) => flags.acknowledge(params.id, body.note),
    "audit.list": ({ query }) => audit.list(query),
  } satisfies Handlers;
}
