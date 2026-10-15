import { createFileRoute } from "@tanstack/react-router";

import { DeviationsList } from "../components/modules/deviations/DeviationsList.tsx";
import { zDeviationsSearch } from "../components/modules/deviations/search.ts";

export const Route = createFileRoute("/deviations")({ validateSearch: zDeviationsSearch, component: DeviationsList });
