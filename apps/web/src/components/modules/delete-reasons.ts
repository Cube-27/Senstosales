import { deleteBlock, type DeleteBlockReason } from "@senstosales/domain";

/** The plain reason shown on a disabled delete button (INV-35, A-14), in the legacy list's words. */
const REASON: Partial<Record<DeleteBlockReason, string>> = {
  "dc-has-invoice": "DC linked to invoice cannot be deleted",
  "dc-linked-srv": "DC linked to SRV cannot be deleted",
  "invoice-linked-srv": "Invoice linked to SRV cannot be deleted",
};

const reasonOf = (block: DeleteBlockReason | null): string | null => (block === null ? null : (REASON[block] ?? null));

/** Why a DC cannot be deleted while it has an invoice or a linked SRV, or `null` when it can be. */
export const dcDeleteReason = (links: { readonly invoice: unknown; readonly srvs: readonly unknown[] }) =>
  reasonOf(deleteBlock("dc", { invoices: links.invoice === null ? 0 : 1, srvItems: links.srvs.length }));

/** Why an invoice cannot be deleted while an SRV is linked to it, or `null` when it can be. */
export const invoiceDeleteReason = (links: { readonly srvs: readonly unknown[] }) =>
  reasonOf(deleteBlock("invoice", { srvItems: links.srvs.length }));
