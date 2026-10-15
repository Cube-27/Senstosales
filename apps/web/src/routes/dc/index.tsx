import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { LIST_DEFAULTS } from "../../lib/search.ts";

import { DCList } from "../../components/modules/dc/DCList.tsx";
import { zDcSearch } from "../../components/modules/dc/search.ts";

export const Route = createFileRoute("/dc/")({
  validateSearch: zDcSearch,
  search: { middlewares: [stripSearchParams(LIST_DEFAULTS)] },
  component: DCList,
});
