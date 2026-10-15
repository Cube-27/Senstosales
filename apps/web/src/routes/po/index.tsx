import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { LIST_DEFAULTS } from "../../lib/search.ts";

import { POList } from "../../components/modules/po/POList.tsx";
import { zPoSearch } from "../../components/modules/po/search.ts";

export const Route = createFileRoute("/po/")({
  validateSearch: zPoSearch,
  search: { middlewares: [stripSearchParams(LIST_DEFAULTS)] },
  component: POList,
});
