import type { Qty } from "@senstosales/domain";
import { supplyProgressPct } from "@senstosales/domain";

const R = 6;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * The supply progress ring (spec §3, INV-73): the larger of dispatched and accepted over ordered. The ring fills to
 * at most a full circle; the percentage beside it is not clamped. Fixed size, so a new value moves nothing (C8).
 */
export function SupplyProgress(quantities: { readonly ordQty: Qty; readonly dspQty: Qty; readonly rcdQty: Qty }) {
  const pct = supplyProgressPct(quantities);
  const filled = (Math.min(pct, 100) / 100) * CIRCUMFERENCE;
  return (
    <span className="inline-flex w-12 shrink-0 items-center justify-end gap-1" title={`${pct}% supplied`}>
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
        <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" className="stroke-border" />
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          className="stroke-success"
        />
      </svg>
      <span className="role-metadata tabular-nums">{pct}%</span>
    </span>
  );
}
