// Ingestion and delete guards and document-line validation (ARCHITECTURE §6.7, §7.2; C6). Validators return typed
// issues and never throw; the API maps them to 400/409 bodies (SPEC-07, SPEC-11).
import type { IsoDate } from "./dates.ts";
import type { Money, Qty } from "./units.ts";
import { moneyToString, qtyToString } from "./units.ts";

export type IssueCode =
  | "no-lines"
  | "qty-not-positive"
  | "line-not-on-po"
  | "line-not-on-dc"
  | "dc-line-missing"
  | "duplicate-line"
  | "dc-qty-mismatch"
  | "rate-mismatch";

export type Issue = { code: IssueCode; path: string; message: string };

/** INV-42, INV-43: accept when nothing is stored or the incoming date is the same or newer; else skip. */
export const acceptIncoming = (storedDate: IsoDate | null, incomingDate: IsoDate): boolean =>
  storedDate === null || incomingDate >= storedDate;

/** Counts of the backward links that can block a delete, per document kind. */
export type DeleteLinks = {
  dc: { invoices: number; srvItems: number };
  invoice: { srvItems: number };
  po: { dcs: number; invoices: number };
  srv: Record<string, never>;
};

export type DeleteBlockReason =
  | "dc-has-invoice"
  | "dc-linked-srv"
  | "invoice-linked-srv"
  | "po-has-dc"
  | "po-has-invoice";

const DELETE_RULES: { [K in keyof DeleteLinks]: (links: DeleteLinks[K]) => DeleteBlockReason | null } = {
  dc: ({ invoices, srvItems }) => (invoices > 0 ? "dc-has-invoice" : srvItems > 0 ? "dc-linked-srv" : null),
  invoice: ({ srvItems }) => (srvItems > 0 ? "invoice-linked-srv" : null),
  po: ({ dcs, invoices }) => (dcs > 0 ? "po-has-dc" : invoices > 0 ? "po-has-invoice" : null),
  // The date winner recomputes after an SRV delete (ARCHITECTURE §6.7).
  srv: () => null,
};

/** INV-35: the reason a delete is refused (409), or `null` when it may proceed (A-14). */
export const deleteBlock = <K extends keyof DeleteLinks>(kind: K, links: DeleteLinks[K]): DeleteBlockReason | null =>
  DELETE_RULES[kind](links);

type PoLinesInput = { poItemIds: ReadonlySet<string>; lines: readonly { poItemId: string; qty: Qty }[] };

// At least one line, each on an item of the PO with qty > 0; no upper cap (A-7).
function validatePoLines({ poItemIds, lines }: PoLinesInput): Issue[] {
  if (lines.length === 0) return [{ code: "no-lines", path: "lines", message: "Add at least one item." }];
  return lines.flatMap((line, i) => {
    const issues: Issue[] = [];
    if (!poItemIds.has(line.poItemId)) {
      issues.push({ code: "line-not-on-po", path: `lines.${i}.poItemId`, message: "This item is not on the PO." });
    }
    if (line.qty <= 0) {
      issues.push({ code: "qty-not-positive", path: `lines.${i}.qty`, message: "Quantity must be more than zero." });
    }
    return issues;
  });
}

/** INV-32: DC lines; any qty > 0 on items of one PO, no cap (quantities above pending save and raise flags). */
export const validateDcLines = validatePoLines;

/** INV-31: PO-direct invoice lines; at least one, each qty > 0, no cap. */
export const validateDirectInvoiceLines = validatePoLines;

type DcInvoiceInput = {
  dcLines: readonly { dcItemId: string; qty: Qty; poRate: Money }[];
  lines: readonly { dcItemId: string; qty: Qty; rate: Money }[];
};

/** INV-29: a DC-sourced invoice has exactly the DC's lines, each with qty = DC qty and rate = PO item rate (A-8). */
export function validateDcInvoiceLines({ dcLines, lines }: DcInvoiceInput): Issue[] {
  const byId = new Map(dcLines.map((dcLine) => [dcLine.dcItemId, dcLine]));
  const seen = new Set<string>();
  const issues = lines.flatMap((line, i): Issue[] => {
    const dcLine = byId.get(line.dcItemId);
    if (!dcLine)
      return [{ code: "line-not-on-dc", path: `lines.${i}.dcItemId`, message: "This item is not on the DC." }];
    if (seen.has(line.dcItemId)) {
      return [
        { code: "duplicate-line", path: `lines.${i}.dcItemId`, message: "This DC item is already on the invoice." },
      ];
    }
    seen.add(line.dcItemId);
    const issues: Issue[] = [];
    if (line.qty !== dcLine.qty) {
      const message = `Quantity must equal the DC quantity (${qtyToString(dcLine.qty)}).`;
      issues.push({ code: "dc-qty-mismatch", path: `lines.${i}.qty`, message });
    }
    if (line.rate !== dcLine.poRate) {
      const message = `Rate must equal the PO rate (${moneyToString(dcLine.poRate)}).`;
      issues.push({ code: "rate-mismatch", path: `lines.${i}.rate`, message });
    }
    return issues;
  });
  const missing = dcLines.some((dcLine) => !seen.has(dcLine.dcItemId));
  return missing
    ? [...issues, { code: "dc-line-missing", path: "lines", message: "Every DC item must be on the invoice." }]
    : issues;
}

type SavedLine = { id: string; qty: Qty; rate?: Money };

/**
 * INV-33: paths of saved line fields an update would change (`lines.<id>.qty`, `lines.<id>.rate`), or `lines.<id>`
 * for a line added or removed. Any entry means the service rejects the update (A-14). DC lines carry no rate.
 */
export function changedImmutableFields(before: readonly SavedLine[], after: readonly SavedLine[]): string[] {
  const afterById = new Map(after.map((line) => [line.id, line]));
  const beforeIds = new Set(before.map((line) => line.id));
  const changed = before.flatMap((line) => {
    const next = afterById.get(line.id);
    if (!next) return [`lines.${line.id}`];
    return [
      ...(next.qty === line.qty ? [] : [`lines.${line.id}.qty`]),
      ...(next.rate === line.rate ? [] : [`lines.${line.id}.rate`]),
    ];
  });
  const added = after.filter((line) => !beforeIds.has(line.id)).map((line) => `lines.${line.id}`);
  return [...changed, ...added];
}
