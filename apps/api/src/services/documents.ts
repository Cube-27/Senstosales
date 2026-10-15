// The DC, GC and invoice Excel downloads (SPEC-12 §2): the document's data loaded, built by `@senstosales/documents`,
// written through Storage under `exports/<ulid>.xlsx` and returned with the legacy file name. A download is not a
// write batch, so it adds no audit row (SPEC-12 §9). The builders load on the first download (D-0335).
import type { DcDocument, InvoiceDocument } from "@senstosales/documents";
import type { Download } from "@senstosales/schemas";

import { dcNotFound, invoiceNotFound, onboardingRequired } from "../errors.ts";
import { newId } from "../ids.ts";
import { invoicesOfDcs, itemsOfDc } from "../repositories/dc.ts";
import { dcForDocument, invoiceForDocument } from "../repositories/documents.ts";
import { itemsOfInvoice } from "../repositories/invoice.ts";
import { findSupplier } from "../repositories/supplier.ts";
import type { ServiceDeps } from "./index.ts";

const writers = () => import("@senstosales/documents");

export function documentsService({ db, storage }: Pick<ServiceDeps, "db" | "storage">) {
  async function profile() {
    const row = await findSupplier(db);
    if (row === null) throw onboardingRequired();
    return row;
  }

  async function dcDocument(id: string): Promise<DcDocument> {
    const [row, items, invoices, supplier, { documentSupplier }] = await Promise.all([
      dcForDocument(db, id),
      itemsOfDc(db, id),
      invoicesOfDcs(db, [id]),
      profile(),
      writers(),
    ]);
    if (row === undefined) throw dcNotFound();
    return {
      supplier: documentSupplier(supplier, row.dc),
      dc: row.dc,
      po: row.po,
      invoiceNumber: invoices.get(id)?.number ?? null,
      items,
    };
  }

  async function invoiceDocument(id: string): Promise<InvoiceDocument> {
    const [row, items, supplier, { documentSupplier }] = await Promise.all([
      invoiceForDocument(db, id),
      itemsOfInvoice(db, id),
      profile(),
      writers(),
    ]);
    if (row === undefined) throw invoiceNotFound();
    return { supplier: documentSupplier(supplier, row.invoice), invoice: row.invoice, po: row.po, dc: row.dc, items };
  }

  /** Keeps a copy of the file under `exports/`, then hands it back as the download. */
  async function stored(fileName: string, bytes: Uint8Array): Promise<Download> {
    await storage.put(`exports/${newId()}.xlsx`, bytes);
    return { fileName, bytes };
  }

  return {
    async dcExcel(id: string) {
      const doc = await dcDocument(id);
      const { buildDcWorkbook, dcFileName } = await writers();
      return stored(dcFileName(doc.dc.number), await buildDcWorkbook(doc));
    },
    async gcExcel(id: string) {
      const doc = await dcDocument(id);
      const { buildGcWorkbook, gcFileName } = await writers();
      return stored(gcFileName(doc.dc.number), await buildGcWorkbook(doc));
    },
    async invoiceExcel(id: string) {
      const doc = await invoiceDocument(id);
      const { buildInvoiceWorkbook, invoiceFileName } = await writers();
      return stored(invoiceFileName(doc.invoice.number), await buildInvoiceWorkbook(doc));
    },
  };
}

export type DocumentsService = ReturnType<typeof documentsService>;
