// Reconciliation issues (flags, ARCHITECTURE §6.9). Detection and the fingerprint belong to the domain (C2).
import type { FlagDetails, FlagScope, FlagType } from "@senstosales/domain";
import type { zFlagStatus } from "@senstosales/schemas";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { instant, ulid } from "../types.ts";
import { supplierId } from "./supplier.ts";

export const reconciliationIssue = sqliteTable(
  "reconciliation_issue",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    type: text("type").$type<FlagType>().notNull(),
    scopeType: text("scope_type").$type<FlagScope>().notNull(),
    scopeId: ulid("scope_id").notNull(),
    poId: ulid("po_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    details: text("details_json", { mode: "json" }).$type<FlagDetails>().notNull(),
    status: text("status").$type<(typeof zFlagStatus.options)[number]>().notNull(),
    note: text("note"),
    openedAt: instant("opened_at").notNull(),
    acknowledgedAt: instant("acknowledged_at"),
  },
  (t) => [
    uniqueIndex("reconciliation_issue_fingerprint_uq").on(t.fingerprint),
    index("reconciliation_issue_po_id_idx").on(t.poId),
    index("reconciliation_issue_scope_idx").on(t.scopeType, t.scopeId),
  ],
);
