// The audit ledger (SPEC-10 PR 5): a list and nothing else; no route updates, deletes or prunes it (INV-83).
import type { Handlers } from "../app.ts";
import type { AuditService } from "../services/audit.ts";

export function auditRoutes(audit: AuditService) {
  return { "audit.list": ({ query }) => audit.list(query) } satisfies Handlers;
}
