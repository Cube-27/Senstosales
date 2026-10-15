// The DC, GC and invoice Excel downloads (SPEC-12 PR 6).
import type { Handlers } from "../app.ts";
import type { DocumentsService } from "../services/documents.ts";

export function documentsRoutes(documents: DocumentsService) {
  return {
    "dc.excel": ({ params }) => documents.dcExcel(params.id),
    "dc.gcExcel": ({ params }) => documents.gcExcel(params.id),
    "invoice.excel": ({ params }) => documents.invoiceExcel(params.id),
  } satisfies Handlers;
}
