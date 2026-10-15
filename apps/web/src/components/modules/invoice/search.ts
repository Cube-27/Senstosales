// `/invoice`'s URL search (SPEC-14 §2), and `/invoice/create`'s source: `?dc=` for a DC-sourced invoice, `?po=` for
// a PO-direct one.
import { routes, zId } from "@senstosales/schemas";
import { z } from "zod";

import { zRangeSearch } from "../../../lib/search.ts";

export const zInvoiceSearch = routes["invoice.list"].query
  .pick({ page: true, pageSize: true, sort: true, dir: true })
  .extend(zRangeSearch);

export type InvoiceSearch = z.output<typeof zInvoiceSearch>;

export const zInvoiceCreateSearch = z.object({
  dc: zId.optional().catch(undefined),
  po: zId.optional().catch(undefined),
});
