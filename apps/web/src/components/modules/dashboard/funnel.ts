// The Supply Chain Funnel's display (legacy dashboard): each stage's quantity as a share of the ordered quantity, and
// what is not yet dispatched. Presentation of the four quantities the API serves (SPEC-10); no rule is decided here.
import type { RouteOutput } from "@senstosales/schemas";

type Funnel = RouteOutput<"dashboard.summary">["funnel"];
type Qty = Funnel["ordQty"];

/** `part` of `whole` as a percentage to one decimal, held to 0–100 as the legacy bar; `0.0` with nothing ordered. */
export function sharePct(part: number, whole: number): { readonly width: number; readonly text: string } {
  const tenths = whole > 0 ? Math.min(1000, Math.max(0, Math.round((part * 1000) / whole))) : 0;
  return { width: tenths / 10, text: `${Math.trunc(tenths / 10)}.${tenths % 10}%` };
}

/** Ordered minus dispatched, never below 0, as legacy showed it. */
export function pendingDispatch({ ordQty, dspQty }: Pick<Funnel, "ordQty" | "dspQty">): Qty {
  // A difference of two milli-unit integers is a milli-unit integer; the brand cannot follow arithmetic.
  return Math.max(0, ordQty - dspQty) as Qty;
}
