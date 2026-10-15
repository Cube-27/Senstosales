// The ledger's Module column and filter: each audited entity type under the legacy category names and colours
// (Dispatch, Invoicing and Receipts coloured; the rest plain).
import type { BadgeProps } from "../../common/index.ts";

interface Module {
  readonly label: string;
  readonly color: NonNullable<BadgeProps["color"]>;
}

/** Every entity type an audit row is written for (`apps/api` services), in the filter's order. */
export const MODULES: Readonly<Record<string, Module>> = {
  po: { label: "Purchase Orders", color: "neutral" },
  po_item: { label: "PO Items", color: "neutral" },
  dc: { label: "Dispatch (DC)", color: "success" },
  invoice: { label: "Invoicing", color: "warning" },
  srv: { label: "Receipts (SRV)", color: "info" },
  reconciliation_issue: { label: "Deviations", color: "neutral" },
  source_document: { label: "Documents", color: "neutral" },
  buyer: { label: "Buyers", color: "neutral" },
  supplier: { label: "Supplier", color: "neutral" },
  settings: { label: "Settings", color: "neutral" },
  secret: { label: "Credentials", color: "neutral" },
  app_user: { label: "Users", color: "neutral" },
};

/** An entity type's module; a type the table does not name shows as itself. */
export const moduleOf = (entityType: string): Module => MODULES[entityType] ?? { label: entityType, color: "neutral" };
