// Received and rejected quantities by the date-winner rule (ARCHITECTURE §6.3, spec §3). Only document dates decide
// the winner; upload or ingest order never does (INV-15).
import type { IsoDate } from "./dates.ts";
import { compareIsoDate } from "./dates.ts";
import type { Money, Qty } from "./units.ts";
import { MONEY_DP, QTY_DP, roundToMoney, sumMoney, sumQty } from "./units.ts";

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
export const srvLineRcd = ({ rcdQty, acceptedQty }: Pick<SrvLine, "rcdQty" | "acceptedQty">): Qty =>
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

/** An SRV line as the SRV list totals it, with the PO item it is matched to (INV-39), or `null`. */
export type SrvTotalsLine = Pick<SrvLine, "rcdQty" | "acceptedQty" | "rejQty"> & {
  poItem: { id: string; ordQty: Qty; rate: Money } | null;
};

export type SrvTotals = { ordQty: Qty; rcdQty: Qty; acceptedQty: Qty; rejQty: Qty; value: Money };

/**
 * The SRV list's columns over some SRV lines, as the legacy SRV list sums them: received per INV-11, Accepted shows
 * received (INV-09, EC-11), rejected 0 when absent (INV-12), ordered once per matched PO item, and value = received ×
 * the PO item's rate, each line rounded to 5 dp. An unmatched line has no ordered quantity or value.
 */
export function srvTotals(lines: readonly SrvTotalsLine[]): SrvTotals {
  const rcdQty = sumQty(lines.map(srvLineRcd));
  const items = new Map(lines.flatMap(({ poItem }) => (poItem ? [[poItem.id, poItem.ordQty] as const] : [])));
  const value = (line: SrvTotalsLine): Money =>
    line.poItem
      ? roundToMoney(BigInt(srvLineRcd(line)) * BigInt(line.poItem.rate), QTY_DP + MONEY_DP, 5)
      : (0 as Money);
  return {
    ordQty: sumQty([...items.values()]),
    rcdQty,
    acceptedQty: rcdQty,
    rejQty: sumQty(lines.map((l) => l.rejQty ?? (0 as Qty))),
    value: sumMoney(lines.map(value)),
  };
}
