// Received and rejected quantities by the date-winner rule (ARCHITECTURE §6.3, spec §3). Only document dates decide
// the winner; upload or ingest order never does (INV-15).
import type { IsoDate } from "./dates.ts";
import { compareIsoDate } from "./dates.ts";
import type { Qty } from "./units.ts";
import { sumQty } from "./units.ts";

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

/** INV-11: `COALESCE(NULLIF(rcd, 0), accepted, 0)`. */
const lineRcd = ({ rcdQty, acceptedQty }: SrvLine): Qty => (rcdQty || acceptedQty || 0) as Qty;

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
    rcd: sumQty(srvLines.map(lineRcd)),
    rej: sumQty(srvLines.map((l) => l.rejQty ?? (0 as Qty))),
  };
}
