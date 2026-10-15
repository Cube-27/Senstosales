// Reconciliation flags (ARCHITECTURE §6.9, spec §8, A-7, A-13, A-15, A-24): accept data, flag deviation, don't reject.
// Detection is pure; the recompute service (SPEC-08) stores what `diffFlags` returns.
import { byCodeUnit, type IsoDate } from "./dates.ts";
import type { ItemStatus } from "./status.ts";
import type { Qty } from "./units.ts";
import { gtTol, qtyToString } from "./units.ts";

/** INV-58: the v1 flag types, exactly these nine (A-24, revised 2026-10-15). */
export const FLAG_TYPES = [
  "QTY_MISMATCH",
  "DOC_NUMBER_CONFLICT",
  "OVER_DISPATCH",
  "OVER_INVOICE",
  "DOC_ON_CANCELLED_ITEM",
  "MANUAL_ADJUSTMENT_OVERLAP",
  "SRV_PO_ITEM_ZERO",
  "SRV_DUPLICATE_ITEM",
  "SRV_UNKNOWN_PO_ITEM",
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
    srvId: string;
    /** PO ITM and SRV ITM as BHEL printed them; they key the row within its SRV. */
    poItemNo: number;
    srvItemNo: number;
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
        // Code-unit order: the fingerprint must not depend on the machine.
        docIds: [...new Set(later)].sort(byCodeUnit),
      });
    }
  }
}

/** What every SRV line's flags read from the PO: its items by id, the ids of its own DCs and invoices, and the SRV
 * lines whose (SRV, PO ITM, SRV ITM) key another line also has. */
type SrvContext = {
  items: ReadonlyMap<string, SnapshotItem>;
  docs: { dc: ReadonlySet<string>; invoice: ReadonlySet<string> };
  duplicates: ReadonlySet<string>;
};

function srvContext({ items, srvLines }: PoFlagSnapshot): SrvContext {
  const byKey = Map.groupBy(srvLines, (line) => `${line.srvId}/${line.poItemNo}/${line.srvItemNo}`);
  return {
    items: new Map(items.map((item) => [item.id, item])),
    docs: {
      dc: new Set(items.flatMap((item) => item.dcLines.map((line) => line.dcId))),
      invoice: new Set(items.flatMap((item) => item.invoiceLines.map((line) => line.invoiceId))),
    },
    duplicates: new Set([...byKey.values()].filter((group) => group.length > 1).flatMap((g) => g.map((l) => l.id))),
  };
}

/** INV-52, INV-53, INV-58: flags on one SRV line. */
function srvLineFlags(line: SnapshotSrvLine, { items, docs, duplicates }: SrvContext, add: AddFlag): void {
  const flag = (type: FlagType, details: Omit<FlagDetails, "docIds"> & { docIds?: readonly string[] }) =>
    add(type, "srv_item", line.id, { docIds: [], ...details });
  // BHEL's row is stored as printed; its oddities are flagged, never fixed (A-24 revised).
  if (line.poItemNo === 0) flag("SRV_PO_ITEM_ZERO", { field: "po_item_no", expected: null, actual: "0" });
  else if (line.poItemId === null) {
    flag("SRV_UNKNOWN_PO_ITEM", { field: "po_item_no", expected: null, actual: String(line.poItemNo) });
  }
  if (duplicates.has(line.id)) {
    flag("SRV_DUPLICATE_ITEM", { field: "srv_item_no", expected: null, actual: `${line.poItemNo}/${line.srvItemNo}` });
  }
  // An SRV ord_qty of 0 is one the page lacked, and legacy compares only a positive one (EC-31).
  const item = line.poItemId === null ? undefined : items.get(line.poItemId);
  if (item && line.ordQty > 0 && (gtTol(line.ordQty, item.ordQty) || gtTol(item.ordQty, line.ordQty))) {
    flag("QTY_MISMATCH", { field: "ord_qty", expected: qtyToString(item.ordQty), actual: qtyToString(line.ordQty) });
  }
  // The link was resolved in the SRV date's FY (INV-37). Only a document that exists and belongs to another PO
  // conflicts; a number with no document in the app does not (A-10 revised).
  const references = [
    ["challan_no", line.challanNo, line.resolvedDcId, docs.dc],
    ["invoice_no", line.invoiceNo, line.resolvedInvoiceId, docs.invoice],
  ] as const;
  for (const [field, raw, resolvedId, own] of references) {
    const actual = raw?.trim();
    if (actual && resolvedId !== null && !own.has(resolvedId)) {
      flag("DOC_NUMBER_CONFLICT", { field, expected: null, actual, docIds: [resolvedId] });
    }
  }
}

/** INV-52..INV-58: the flags the snapshot calls for, item by item, then SRV line by SRV line. */
export function detectFlags(snapshot: PoFlagSnapshot): DesiredFlag[] {
  const flags: DesiredFlag[] = [];
  const add: AddFlag = (type, scopeType, scopeId, details) =>
    flags.push({ type, scopeType, scopeId, poId: snapshot.poId, details });
  for (const item of snapshot.items) itemFlags(item, add);
  const context = srvContext(snapshot);
  for (const line of snapshot.srvLines) srvLineFlags(line, context, add);
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
