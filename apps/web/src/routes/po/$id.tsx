import { createFileRoute } from "@tanstack/react-router";

import { PODetail } from "../../components/modules/po/PODetail.tsx";

export const Route = createFileRoute("/po/$id")({
  component: function PODetailRoute() {
    const { id } = Route.useParams();
    // A new PO starts a fresh page: no tab, editor or resolved flag carries over from the last one.
    return <PODetail key={id} id={id} />;
  },
});
