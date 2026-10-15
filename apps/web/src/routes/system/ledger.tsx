import { createFileRoute } from "@tanstack/react-router";

import { LedgerList } from "../../components/modules/ledger/LedgerList.tsx";
import { zLedgerSearch } from "../../components/modules/ledger/search.ts";

export const Route = createFileRoute("/system/ledger")({ validateSearch: zLedgerSearch, component: LedgerList });
