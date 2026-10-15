// What a flag says on the deviations screen, in the legacy screen's words.
import type { RouteOutput } from "@senstosales/schemas";

import { titleCase } from "../../../lib/text.ts";

export type FlagRow = RouteOutput<"flags.list">["items"][number];

/** The Issue column: the ordered-quantity mismatch spelled out, any other flag as its field's mismatch. */
export function issueText({ type, details }: Pick<FlagRow, "type" | "details">): string {
  if (type === "QTY_MISMATCH" && details.field === "ord_qty") {
    return `Ordered qty mismatch: ${details.actual} actual vs ${details.expected ?? "—"} expected`;
  }
  return `${titleCase(details.field)} mismatch`;
}

/** The Document column's text for a flag on a line with no SRV to link. */
export const SCOPE_LABEL: Record<FlagRow["scopeType"], string> = {
  srv_item: "SRV item",
  po_item: "PO item",
  dc_item: "DC item",
  invoice_item: "Invoice item",
};
