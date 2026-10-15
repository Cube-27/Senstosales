import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { LIST_DEFAULTS } from "../../lib/search.ts";

import { zSrvSearch } from "../../components/modules/srv/search.ts";
import { SRVList } from "../../components/modules/srv/SRVList.tsx";

export const Route = createFileRoute("/srv/")({
  validateSearch: zSrvSearch,
  search: { middlewares: [stripSearchParams(LIST_DEFAULTS)] },
  component: SRVList,
});
