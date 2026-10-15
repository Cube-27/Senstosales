// The Supply Chain Funnel's display (legacy dashboard): each stage's quantity as a share of the ordered quantity.
// Presentation of the quantities the API serves (SPEC-10); no rule is decided here (C2).

/** `part` of `whole` as a percentage to one decimal, held to 0–100 as the legacy bar; `0.0` with nothing ordered. */
export function sharePct(part: number, whole: number): { readonly width: number; readonly text: string } {
  const tenths = whole > 0 ? Math.min(1000, Math.max(0, Math.round((part * 1000) / whole))) : 0;
  return { width: tenths / 10, text: `${Math.trunc(tenths / 10)}.${tenths % 10}%` };
}
