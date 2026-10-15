import { createFileRoute } from "@tanstack/react-router";

import { zSrvSearch } from "../../components/modules/srv/search.ts";
import { SRVList } from "../../components/modules/srv/SRVList.tsx";

export const Route = createFileRoute("/srv/")({ validateSearch: zSrvSearch, component: SRVList });
