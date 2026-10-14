// Reconciliation flags (ARCHITECTURE §6.9, spec §8, A-7, A-13, A-15, A-24): accept data, flag deviation, don't reject.
// Detection is pure; the recompute service (SPEC-08) stores what `diffFlags` returns.
import type { IsoDate } from "./dates.ts";
import type { Qty } from "./units.ts";
import { gtTol, qtyToString } from "./units.ts";

/** INV-58: the v1 flag types, exactly these six (A-24). */
export const FLAG_TYPES = [
  "QTY_MISMATCH",
  "DOC_NUMBER_CONFLICT",
  "OVER_DISPATCH",
  "OVER_INVOICE",
  "DOC_ON_CANCELLED_ITEM",
  "MANUAL_ADJUSTMENT_OVERLAP",
] as const;

export type FlagType = (typeof FLAG_TYPES)[number];

/** The row a flag is about (`reconciliation_issue.scope_type`, ARCHITECTURE §6.9). */
export type FlagScope = "srv_item" | "po_item" | "dc_item" | "invoice_item";

/** One PO with its items, documents and SRV lines, as stored (SPEC-03 §4.3). Instants are ISO-8601 UTC text. */
export type PoFlagSnapshot = {
  poId: string;
  items: readonly {
    id: string;
    ordQty: Qty;
    cancelled: boolean;
    dspQty: Qty;
    invoicedQty: Qty;
    manualDispatchedQty: Qty;
    manualSetAt: string | null;
    dcLines: readonly { id: string; dcId: string; createdAt: string }[];
    invoiceLines: readonly { id: string; invoiceId: string }[];
  }[];
  srvLines: readonly {
    id: string;
    poItemId: string | null;
    ordQty: Qty;
    srvDate: IsoDate;
    challanNo: string | null;
    invoiceNo: string | null;
    resolvedDcId: string | null;
    resolvedInvoiceId: string | null;
  }[];
};

type SnapshotItem = PoFlagSnapshot["items"][number];
type SnapshotSrvLine = PoFlagSnapshot["srvLines"][number];

/**
 * A flag the snapshot calls for. `details` is the stored `details_json` (field, expected, actual), quantities as exact
 * decimal strings; `docIds` are the DCs or invoices the flag cites.
 */
export type DesiredFlag = {
  type: FlagType;
  scopeType: FlagScope;
  scopeId: string;
  poId: string;
  details: { field: string; expected: string | null; actual: string };
  docIds: readonly string[];
};

type Flag = Omit<DesiredFlag, "poId">;

/** INV-54, INV-55, INV-56, INV-57: flags on one PO item. */
function itemFlags(item: SnapshotItem): Flag[] {
  const flags: Flag[] = [];
  const poItem = (type: FlagType, field: string, expected: Qty | null, actual: Qty, docIds: string[] = []): Flag => ({
    type,
    scopeType: "po_item",
    scopeId: item.id,
    details: { field, expected: expected === null ? null : qtyToString(expected), actual: qtyToString(actual) },
    docIds,
  });
  if (gtTol(item.dspQty, item.ordQty)) flags.push(poItem("OVER_DISPATCH", "dsp_qty", item.ordQty, item.dspQty));
  if (gtTol(item.invoicedQty, item.ordQty))
    flags.push(poItem("OVER_INVOICE", "invoiced_qty", item.ordQty, item.invoicedQty));
  if (item.cancelled) {
    const onCancelled = (scopeType: FlagScope, scopeId: string, docId: string): Flag => ({
      type: "DOC_ON_CANCELLED_ITEM",
      scopeType,
      scopeId,
      details: { field: "status", expected: null, actual: "Cancelled" },
      docIds: [docId],
    });
    for (const line of item.dcLines) flags.push(onCancelled("dc_item", line.id, line.dcId));
    for (const line of item.invoiceLines) flags.push(onCancelled("invoice_item", line.id, line.invoiceId));
  }
  // A-15: only a real DC overlaps the manual quantity; PO-direct invoices never do (EC-10). Without a set time there
  // is no "after", so nothing is flagged.
  const { manualSetAt } = item;
  if (item.manualDispatchedQty > 0 && manualSetAt !== null) {
    const later = item.dcLines.filter((line) => line.createdAt > manualSetAt).map((line) => line.dcId);
    if (later.length > 0) {
      flags.push(
        poItem(
          "MANUAL_ADJUSTMENT_OVERLAP",
          "manual_dispatched_qty",
          null,
          item.manualDispatchedQty,
          [...new Set(later)].sort(),
        ),
      );
    }
  }
  return flags;
}

/** INV-52, INV-53: flags on one SRV line. */
function srvLineFlags(line: SnapshotSrvLine, items: ReadonlyMap<string, SnapshotItem>): Flag[] {
  const flags: Flag[] = [];
  const srvItem = (type: FlagType, details: Flag["details"]): Flag => ({
    type,
    scopeType: "srv_item",
    scopeId: line.id,
    details,
    docIds: [],
  });
  // An unmatched line (EC-12) has no PO quantity to compare with.
  const item = line.poItemId === null ? undefined : items.get(line.poItemId);
  if (item && (gtTol(line.ordQty, item.ordQty) || gtTol(item.ordQty, line.ordQty))) {
    flags.push(
      srvItem("QTY_MISMATCH", {
        field: "ord_qty",
        expected: qtyToString(item.ordQty),
        actual: qtyToString(line.ordQty),
      }),
    );
  }
  // The link was resolved in the SRV date's FY (INV-37); a cited number left unresolved conflicts (A-10, EC-03).
  const references = [
    ["challan_no", line.challanNo, line.resolvedDcId],
    ["invoice_no", line.invoiceNo, line.resolvedInvoiceId],
  ] as const;
  for (const [field, raw, resolvedId] of references) {
    const cited = raw?.trim();
    if (cited && resolvedId === null)
      flags.push(srvItem("DOC_NUMBER_CONFLICT", { field, expected: null, actual: cited }));
  }
  return flags;
}

/** INV-52..INV-57: the flags the snapshot calls for, item by item, then SRV line by SRV line. */
export function detectFlags(snapshot: PoFlagSnapshot): DesiredFlag[] {
  const items = new Map(snapshot.items.map((item) => [item.id, item]));
  return [...snapshot.items.flatMap(itemFlags), ...snapshot.srvLines.flatMap((line) => srvLineFlags(line, items))].map(
    (flag) => ({ ...flag, poId: snapshot.poId }),
  );
}

/** §6.9: type, scope, quantities and document ids. JSON keeps fields apart whatever characters they hold. */
export const fingerprint = (flag: DesiredFlag): string =>
  JSON.stringify([
    flag.type,
    flag.scopeType,
    flag.scopeId,
    flag.details.field,
    flag.details.expected,
    flag.details.actual,
    flag.docIds,
  ]);

/**
 * INV-59: the desired flags to insert. A fingerprint already stored, open or acknowledged, is never inserted again,
 * and stored flags missing from `desired` are left as they are (EC-05): detection never closes a flag.
 */
export function diffFlags(desired: readonly DesiredFlag[], stored: readonly { fingerprint: string }[]): DesiredFlag[] {
  const seen = new Set(stored.map((flag) => flag.fingerprint));
  return desired.filter((flag) => {
    const key = fingerprint(flag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
