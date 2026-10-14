// Reconciliation flags (ARCHITECTURE §6.9, spec §8, A-7, A-13, A-15, A-24): accept data, flag deviation, don't reject.
// Detection is pure; the recompute service (SPEC-08) stores what `diffFlags` returns.
import type { IsoDate } from "./dates.ts";
import type { ItemStatus } from "./status.ts";
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

/** The rows a flag can be about (`reconciliation_issue.scope_type`, ARCHITECTURE §6.9). */
export const FLAG_SCOPES = ["srv_item", "po_item", "dc_item", "invoice_item"] as const;

export type FlagScope = (typeof FLAG_SCOPES)[number];

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

/** The stored `details_json`: quantities as exact decimal strings, and the DCs or invoices the flag cites. */
export type FlagDetails = { field: string; expected: string | null; actual: string; docIds: readonly string[] };

/** A flag the snapshot calls for, shaped as a `reconciliation_issue` row without its id, fingerprint and status. */
export type DesiredFlag = { type: FlagType; scopeType: FlagScope; scopeId: string; poId: string; details: FlagDetails };

type AddFlag = (type: FlagType, scopeType: FlagScope, scopeId: string, details: FlagDetails) => void;

/** INV-54, INV-55, INV-56, INV-57: flags on one PO item. */
function itemFlags(item: SnapshotItem, add: AddFlag): void {
  const expected = qtyToString(item.ordQty);
  if (gtTol(item.dspQty, item.ordQty)) {
    add("OVER_DISPATCH", "po_item", item.id, {
      field: "dsp_qty",
      expected,
      actual: qtyToString(item.dspQty),
      docIds: [],
    });
  }
  if (gtTol(item.invoicedQty, item.ordQty)) {
    const actual = qtyToString(item.invoicedQty);
    add("OVER_INVOICE", "po_item", item.id, { field: "invoiced_qty", expected, actual, docIds: [] });
  }
  if (item.cancelled) {
    const details = (docId: string): FlagDetails => ({
      field: "status",
      expected: null,
      actual: "Cancelled" satisfies ItemStatus,
      docIds: [docId],
    });
    for (const line of item.dcLines) add("DOC_ON_CANCELLED_ITEM", "dc_item", line.id, details(line.dcId));
    for (const line of item.invoiceLines)
      add("DOC_ON_CANCELLED_ITEM", "invoice_item", line.id, details(line.invoiceId));
  }
  // A-15: only a real DC overlaps the manual quantity; PO-direct invoices never do (EC-10). Without a set time there
  // is no "after", so nothing is flagged.
  const { manualSetAt } = item;
  if (item.manualDispatchedQty > 0 && manualSetAt !== null) {
    const later = item.dcLines.filter((line) => line.createdAt > manualSetAt).map((line) => line.dcId);
    if (later.length > 0) {
      add("MANUAL_ADJUSTMENT_OVERLAP", "po_item", item.id, {
        field: "manual_dispatched_qty",
        expected: null,
        actual: qtyToString(item.manualDispatchedQty),
        // Code-unit order, not locale order: the fingerprint must not depend on the machine.
        docIds: [...new Set(later)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      });
    }
  }
}

/** INV-52, INV-53: flags on one SRV line. */
function srvLineFlags(line: SnapshotSrvLine, items: ReadonlyMap<string, SnapshotItem>, add: AddFlag): void {
  // An unmatched line (EC-12) has no PO quantity to compare with.
  const item = line.poItemId === null ? undefined : items.get(line.poItemId);
  if (item && (gtTol(line.ordQty, item.ordQty) || gtTol(item.ordQty, line.ordQty))) {
    const [expected, actual] = [qtyToString(item.ordQty), qtyToString(line.ordQty)];
    add("QTY_MISMATCH", "srv_item", line.id, { field: "ord_qty", expected, actual, docIds: [] });
  }
  // The link was resolved in the SRV date's FY (INV-37); a cited number left unresolved conflicts (A-10, EC-03).
  const references = [
    ["challan_no", line.challanNo, line.resolvedDcId],
    ["invoice_no", line.invoiceNo, line.resolvedInvoiceId],
  ] as const;
  for (const [field, raw, resolvedId] of references) {
    const cited = raw?.trim();
    if (cited && resolvedId === null) {
      add("DOC_NUMBER_CONFLICT", "srv_item", line.id, { field, expected: null, actual: cited, docIds: [] });
    }
  }
}

/** INV-52..INV-57: the flags the snapshot calls for, item by item, then SRV line by SRV line. */
export function detectFlags(snapshot: PoFlagSnapshot): DesiredFlag[] {
  const flags: DesiredFlag[] = [];
  const add: AddFlag = (type, scopeType, scopeId, details) =>
    flags.push({ type, scopeType, scopeId, poId: snapshot.poId, details });
  for (const item of snapshot.items) itemFlags(item, add);
  const items = new Map(snapshot.items.map((item) => [item.id, item]));
  for (const line of snapshot.srvLines) srvLineFlags(line, items, add);
  return flags;
}

/** §6.9: type, scope, quantities and document ids. JSON keeps fields apart whatever characters they hold. */
export const fingerprint = ({ type, scopeType, scopeId, details }: DesiredFlag): string =>
  JSON.stringify([type, scopeType, scopeId, details.field, details.expected, details.actual, details.docIds]);

/**
 * INV-59: the desired flags to insert, each with its fingerprint. A fingerprint already stored, open or acknowledged,
 * is never inserted again, and stored flags missing from `desired` are left as they are (EC-05): detection never
 * closes a flag.
 */
export function diffFlags(
  desired: readonly DesiredFlag[],
  stored: readonly { fingerprint: string }[],
): (DesiredFlag & { fingerprint: string })[] {
  const seen = new Set(stored.map((flag) => flag.fingerprint));
  const inserts: (DesiredFlag & { fingerprint: string })[] = [];
  for (const flag of desired) {
    const key = fingerprint(flag);
    if (seen.has(key)) continue;
    seen.add(key);
    inserts.push({ ...flag, fingerprint: key });
  }
  return inserts;
}
