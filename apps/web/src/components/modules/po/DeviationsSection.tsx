import type { RouteOutput } from "@senstosales/schemas";
import { fmtFlagType, fmtInstantDate } from "@senstosales/schemas";
import { useState } from "react";

import { api, useInvalidate } from "../../../lib/api.ts";
import { AlertCircle, CheckCircle } from "../../../lib/icons.ts";
import { Badge, Button, useToast } from "../../common/index.ts";

type Detail = RouteOutput<"po.detail">;
type Flag = Detail["flags"][number];

/** `ord_qty` -> `Ord Qty`, as legacy humanised a field name. */
const humanize = (key: string): string => key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());

/** What the flag says, in the legacy section's words. */
function summary(flag: Flag, itemNo: string | undefined): string {
  const { field, expected, actual } = flag.details;
  if (flag.type === "QTY_MISMATCH" && field === "ord_qty") {
    return `${itemNo ? `PO item ${itemNo} ordered qty mismatch` : "Ordered qty mismatch"}: ${actual} vs ${expected ?? "-"} expected`;
  }
  return `${humanize(field)} mismatch`;
}

const SCOPE: Record<Flag["scopeType"], string> = {
  srv_item: "SRV item",
  po_item: "PO item",
  dc_item: "Delivery challan item",
  invoice_item: "Invoice item",
};

export interface DeviationsSectionProps {
  readonly flags: readonly Flag[];
  /** Item number by PO item id, for flags on an item. */
  readonly itemNo: (id: string) => string | undefined;
}

/**
 * The PO page's open flags (spec §8, A-7) with MARK RESOLVED (acknowledge, INV-59). Every flag shown on this visit
 * keeps its row: the refetched page no longer lists a resolved flag, but it stays here, marked resolved, until the
 * page is opened again, so resolving moves nothing (C8). Flags opened meanwhile are added at the end.
 */
export function DeviationsSection({ flags, itemNo }: DeviationsSectionProps) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [resolved, setResolved] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(flags);
  const added = flags.filter((f) => !shown.some((s) => s.id === f.id));
  if (added.length > 0) setShown([...shown, ...added]);
  if (shown.length === 0) return null;

  async function resolve(flag: Flag) {
    try {
      await api.request("flags.acknowledge", { params: { id: flag.id }, body: { note: null } });
      setResolved((done) => new Set(done).add(flag.id));
      await invalidate("flags", "po");
    } catch (error) {
      toast("Could not resolve", error instanceof Error ? error.message : "Try again.", "error");
    }
  }

  return (
    <section aria-label="Discrepancies" className="rounded-lg border border-warning/20 bg-warning/5 p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-warning/10">
          <AlertCircle className="size-5 text-warning" aria-hidden />
        </div>
        <div>
          <h3 className="role-heading-sm">Discrepancies Detected</h3>
          <p className="role-helper-text">
            The following issues were identified during data ingestion and require review.
          </p>
        </div>
      </div>
      <ul className="space-y-3">
        {shown.map((flag) => {
          const item = flag.scopeType === "po_item" ? itemNo(flag.scopeId) : undefined;
          const { field, expected, actual } = flag.details;
          return (
            <li
              key={flag.id}
              className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-4"
            >
              <div className="flex min-w-0 items-start gap-4">
                <Badge color={flag.type === "QTY_MISMATCH" ? "error" : "warning"} size="sm" className="mt-1">
                  {fmtFlagType(flag.type)}
                </Badge>
                <div className="min-w-0">
                  <p className="mb-1 role-field-value">{summary(flag, item)}</p>
                  <p className="role-helper-text">
                    Document: {item ? `PO item ${item}` : SCOPE[flag.scopeType]} · Detected:{" "}
                    {fmtInstantDate(flag.openedAt)}
                  </p>
                  <p className="mt-2 rounded-md border border-border-subtle bg-surface-sunken/50 p-2 role-helper-text">
                    Context: {humanize(field)}: {actual} | Expected: {expected ?? "-"}
                  </p>
                </div>
              </div>
              <div className="w-36 shrink-0 text-right">
                {resolved.has(flag.id) ? (
                  <span className="inline-flex items-center gap-1 role-helper-text text-success">
                    <CheckCircle className="size-4" aria-hidden />
                    Resolved
                  </span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void resolve(flag)}>
                    <CheckCircle aria-hidden />
                    MARK RESOLVED
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
