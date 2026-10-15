import { createFileRoute } from "@tanstack/react-router";

import { DCForm } from "../../components/modules/dc/DCForm.tsx";
import { zDcCreateSearch } from "../../components/modules/dc/search.ts";

export const Route = createFileRoute("/dc/create")({
  validateSearch: zDcCreateSearch,
  component: function DCCreateRoute() {
    const { po } = Route.useSearch();
    return <DCForm key={po ?? "none"} poId={po} />;
  },
});
