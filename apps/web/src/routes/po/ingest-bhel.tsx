import { createFileRoute } from "@tanstack/react-router";

import { BhelSyncScreen } from "../../components/modules/bhel-sync/BhelSyncScreen.tsx";

export const Route = createFileRoute("/po/ingest-bhel")({ component: BhelSyncScreen });
