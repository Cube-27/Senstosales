import { zId } from "@senstosales/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { POForm } from "../../components/modules/po/POForm.tsx";

/** `?id=` opens a stored PO for editing (the PO page's Edit); without it the form starts a new PO. */
const zCreateSearch = z.object({ id: zId.optional().catch(undefined) });

export const Route = createFileRoute("/po/create")({
  validateSearch: zCreateSearch,
  component: function POCreateRoute() {
    const { id } = Route.useSearch();
    return <POForm key={id ?? "new"} id={id} />;
  },
});
