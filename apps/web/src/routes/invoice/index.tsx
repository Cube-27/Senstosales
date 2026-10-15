import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { LIST_DEFAULTS } from "../../lib/search.ts";

import { InvoiceList } from "../../components/modules/invoice/InvoiceList.tsx";
import { zInvoiceSearch } from "../../components/modules/invoice/search.ts";

export const Route = createFileRoute("/invoice/")({
  validateSearch: zInvoiceSearch,
  search: { middlewares: [stripSearchParams(LIST_DEFAULTS)] },
  component: InvoiceList,
});
