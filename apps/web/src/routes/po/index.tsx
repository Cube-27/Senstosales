import { createFileRoute } from "@tanstack/react-router";

import { POList } from "../../components/modules/po/POList.tsx";
import { zPoSearch } from "../../components/modules/po/search.ts";

export const Route = createFileRoute("/po/")({ validateSearch: zPoSearch, component: POList });
