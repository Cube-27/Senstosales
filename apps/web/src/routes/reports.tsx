import { createFileRoute } from "@tanstack/react-router";

import { Reports } from "../components/modules/reports/Reports.tsx";
import { zReportsSearch } from "../components/modules/reports/search.ts";

export const Route = createFileRoute("/reports")({ validateSearch: zReportsSearch, component: Reports });
