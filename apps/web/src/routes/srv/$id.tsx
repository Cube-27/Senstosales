import { createFileRoute } from "@tanstack/react-router";

import { SRVDetail } from "../../components/modules/srv/SRVDetail.tsx";

export const Route = createFileRoute("/srv/$id")({
  component: function SRVDetailRoute() {
    const { id } = Route.useParams();
    return <SRVDetail key={id} id={id} />;
  },
});
