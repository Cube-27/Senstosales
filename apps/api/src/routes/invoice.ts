// GST invoices (SPEC-11): create (DC-sourced or PO-direct) and the create form's previews.
import type { Handlers } from "../app.ts";
import type { InvoiceService } from "../services/invoice.ts";
import type { InvoicePreviewService } from "../services/invoice-preview.ts";

export function invoiceRoutes(invoice: InvoiceService, preview: InvoicePreviewService) {
  return {
    "invoice.previewDc": ({ params }) => preview.fromDc(params.dcId),
    "invoice.previewPo": ({ params }) => preview.fromPo(params.poId),
    "invoice.create": ({ body }) => invoice.create(body),
  } satisfies Handlers;
}
