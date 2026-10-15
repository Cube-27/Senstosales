// GST invoices (SPEC-11): DC-sourced create (PR 3).
import type { Handlers } from "../app.ts";
import type { InvoiceService } from "../services/invoice.ts";

export function invoiceRoutes(invoice: InvoiceService) {
  return {
    "invoice.create": ({ body }) => invoice.create(body),
  } satisfies Handlers;
}
