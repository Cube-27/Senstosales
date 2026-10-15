import { createFileRoute } from "@tanstack/react-router";

import { InvoiceForm } from "../../components/modules/invoice/InvoiceForm.tsx";
import { zInvoiceCreateSearch } from "../../components/modules/invoice/search.ts";

export const Route = createFileRoute("/invoice/create")({
  validateSearch: zInvoiceCreateSearch,
  component: function InvoiceCreateRoute() {
    const { dc, po } = Route.useSearch();
    return <InvoiceForm key={dc ?? po ?? "none"} dcId={dc} poId={po} />;
  },
});
