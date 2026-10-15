// The DC, GC and invoice Excel downloads (SPEC-12 §2): the document's data loaded, built by `@senstosales/documents`,
// written through Storage under `exports/<ulid>.xlsx` and returned with the legacy file name. A download is not a
// write batch, so it adds no audit row (SPEC-12 §9). The builders load on the first download (D-0335).
import type * as documents from "@senstosales/documents";
import type { DcDocument, InvoiceDocument } from "@senstosales/documents";
import type { Download } from "@senstosales/schemas";

import { dcNotFound, invoiceNotFound } from "../errors.ts";
import { newId } from "../ids.ts";
import { itemsOfDc } from "../repositories/dc.ts";
import { dcForDocument, invoiceForDocument } from "../repositories/documents.ts";
import { itemsOfInvoice } from "../repositories/invoice.ts";
import type { Supplier } from "../repositories/supplier.ts";
import type { ServiceDeps } from "./index.ts";

type Writers = typeof documents;

interface DocumentsDeps extends Pick<ServiceDeps, "db" | "storage"> {
  /** The supplier profile; refuses with 409 `onboarding-required` before onboarding. */
  readonly profile: () => Promise<Supplier>;
}

export function documentsService({ db, storage, profile }: DocumentsDeps) {
  async function dcDocument(id: string, { documentSupplier }: Writers): Promise<DcDocument> {
    const [row, items, supplier] = await Promise.all([dcForDocument(db, id), itemsOfDc(db, id), profile()]);
    if (row === undefined) throw dcNotFound();
    return {
      supplier: documentSupplier(supplier, row.dc),
      dc: row.dc,
      po: row.po,
      invoice:
        row.invoiceNumber === null || row.invoiceDate === null
          ? null
          : { number: row.invoiceNumber, invoiceDate: row.invoiceDate },
      items,
    };
  }

  async function invoiceDocument(id: string, { documentSupplier }: Writers): Promise<InvoiceDocument> {
    const [row, items, supplier] = await Promise.all([invoiceForDocument(db, id), itemsOfInvoice(db, id), profile()]);
    if (row === undefined) throw invoiceNotFound();
    return { supplier: documentSupplier(supplier, row.invoice), invoice: row.invoice, po: row.po, dc: row.dc, items };
  }

  async function stored(fileName: string, bytes: Uint8Array): Promise<Download> {
    await storage.put(`exports/${newId()}.xlsx`, bytes);
    return { fileName, bytes };
  }

  return {
    async dcExcel(id: string) {
      const w = await import("@senstosales/documents");
      const doc = await dcDocument(id, w);
      return stored(w.dcFileName(doc.dc.number), await w.buildDcWorkbook(doc));
    },
    async gcExcel(id: string) {
      const w = await import("@senstosales/documents");
      const doc = await dcDocument(id, w);
      return stored(w.gcFileName(doc.dc.number), await w.buildGcWorkbook(doc));
    },
    async invoiceExcel(id: string) {
      const w = await import("@senstosales/documents");
      const doc = await invoiceDocument(id, w);
      return stored(w.invoiceFileName(doc.invoice.number), await w.buildInvoiceWorkbook(doc));
    },
  };
}

export type DocumentsService = ReturnType<typeof documentsService>;
