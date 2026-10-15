// GST invoices (SPEC-11): list, stats, detail, create (DC-sourced or PO-direct), the create form's previews, header
// edit and delete. Downloads are SPEC-12; the list CSV SPEC-13.
import type { Handlers } from "../app.ts";
import type { InvoiceService } from "../services/invoice.ts";
import type { InvoicePreviewService } from "../services/invoice-preview.ts";

export function invoiceRoutes(invoice: InvoiceService, preview: InvoicePreviewService) {
  return {
    "invoice.list": ({ query }) => invoice.list(query),
    "invoice.stats": ({ query }) => invoice.stats(query),
    "invoice.detail": ({ params }) => invoice.detail(params.id),
    "invoice.previewDc": ({ params }) => preview.fromDc(params.dcId),
    "invoice.previewPo": ({ params }) => preview.fromPo(params.poId),
    "invoice.create": ({ body }) => invoice.create(body),
    "invoice.update": ({ params, body }) => invoice.update(params.id, body),
    "invoice.delete": ({ params }) => invoice.delete(params.id),
  } satisfies Handlers;
}
