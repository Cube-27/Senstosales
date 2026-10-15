// Received and rejected quantities by the date-winner rule (ARCHITECTURE §6.3, spec §3). Only document dates decide
// the winner; upload or ingest order never does (INV-15).
import type { IsoDate } from "./dates.ts";
import { compareIsoDate } from "./dates.ts";
import type { Money, Qty } from "./units.ts";
import { qtyValue, sumMoney, sumQty } from "./units.ts";

export type Winner = "po" | "srv";

export type SrvLine = { srvDate: IsoDate; rcdQty: Qty | null; acceptedQty: Qty | null; rejQty: Qty | null };

export type ReceiptInput = {
  poDate: IsoDate;
  /** The PO document's own received and rejected values, stored apart from derived ones (INV-13). */
  poRcdQty: Qty;
  poRejQty: Qty | null;
  /** Every SRV line on the item, whatever its date. */
  srvLines: readonly SrvLine[];
};

export type Receipt = { winner: Winner; rcd: Qty; rej: Qty };

/** INV-10: no SRV -> PO; latest SRV date on or after the PO date -> SRV (a tie goes to SRV); otherwise PO. */
export const dateWinner = (poDate: IsoDate, srvDates: readonly IsoDate[]): Winner =>
  srvDates.some((d) => compareIsoDate(d, poDate) >= 0) ? "srv" : "po";

/** INV-11: one SRV line's received quantity, `COALESCE(NULLIF(rcd, 0), accepted, 0)`. */
const srvLineRcd = ({ rcdQty, acceptedQty }: Pick<SrvLine, "rcdQty" | "acceptedQty">): Qty =>
  (rcdQty || acceptedQty || 0) as Qty;

/**
 * INV-11..INV-13. SRV wins: sums over all SRV lines, not filtered by date. PO wins: the PO document's values,
 * rejected defaulting to 0, including after the last SRV is deleted.
 */
export function computeReceipt({ poDate, poRcdQty, poRejQty, srvLines }: ReceiptInput): Receipt {
  const winner = dateWinner(
    poDate,
    srvLines.map((l) => l.srvDate),
  );
  if (winner === "po") return { winner, rcd: poRcdQty, rej: poRejQty ?? (0 as Qty) };
  return {
    winner,
    rcd: sumQty(srvLines.map(srvLineRcd)),
    rej: sumQty(srvLines.map((l) => l.rejQty ?? (0 as Qty))),
  };
}

export type SrvLineQty = Pick<SrvLine, "rcdQty" | "acceptedQty" | "rejQty">;

export type SrvLineShown = { rcdQty: Qty; acceptedQty: Qty; rejQty: Qty };

/** One line as the SRV screens show it: received per INV-11, Accepted as received (INV-09, EC-11), rejected 0 when absent (INV-12). */
export function srvLineShown(line: SrvLineQty): SrvLineShown {
  const rcdQty = srvLineRcd(line);
  return { rcdQty, acceptedQty: rcdQty, rejQty: line.rejQty ?? (0 as Qty) };
}

/** An SRV line as the SRV list totals it, with the PO item it is matched to (INV-39), or `null`. */
export type SrvTotalsLine = SrvLineQty & { poItem: { id: string; ordQty: Qty; rate: Money } | null };

export type SrvTotals = { ordQty: Qty; rcdQty: Qty; acceptedQty: Qty; rejQty: Qty; value: Money };

/**
 * The SRV list's columns over some SRV lines, as the legacy SRV list sums them: each line as `srvLineShown`, ordered
 * once per matched PO item, and value = received × the PO item's rate, each line rounded to 5 dp. An unmatched line
 * has no ordered quantity or value.
 */
export function srvTotals(lines: readonly SrvTotalsLine[]): SrvTotals {
  const ordered = new Map<string, Qty>();
  const shown: SrvLineShown[] = [];
  const values: Money[] = [];
  for (const line of lines) {
    const qty = srvLineShown(line);
    shown.push(qty);
    if (line.poItem === null) continue;
    ordered.set(line.poItem.id, line.poItem.ordQty);
    values.push(qtyValue(qty.rcdQty, line.poItem.rate));
  }
  const sum = (key: keyof SrvLineShown) => sumQty(shown.map((q) => q[key]));
  return {
    ordQty: sumQty([...ordered.values()]),
    rcdQty: sum("rcdQty"),
    acceptedQty: sum("acceptedQty"),
    rejQty: sum("rejQty"),
    value: sumMoney(values),
  };
}
