import { createFileRoute } from "@tanstack/react-router";

import { zInvoiceCreateSearch } from "../../components/modules/invoice/search.ts";

export const Route = createFileRoute("/invoice/create")({ validateSearch: zInvoiceCreateSearch });
