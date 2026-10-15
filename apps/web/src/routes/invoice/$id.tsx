import { createFileRoute } from "@tanstack/react-router";

import { InvoiceDetail } from "../../components/modules/invoice/InvoiceDetail.tsx";

export const Route = createFileRoute("/invoice/$id")({
  component: function InvoiceDetailRoute() {
    const { id } = Route.useParams();
    // A new invoice starts a fresh page: no open dialog carries over from the last one.
    return <InvoiceDetail key={id} id={id} />;
  },
});
