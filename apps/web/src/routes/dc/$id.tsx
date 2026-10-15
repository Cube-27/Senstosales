import { createFileRoute } from "@tanstack/react-router";

import { DCDetail } from "../../components/modules/dc/DCDetail.tsx";

export const Route = createFileRoute("/dc/$id")({
  component: function DCDetailRoute() {
    const { id } = Route.useParams();
    // A new DC starts a fresh page: no open dialog carries over from the last one.
    return <DCDetail key={id} id={id} />;
  },
});
