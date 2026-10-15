// Tray status (ARCHITECTURE §7.3, §12.4): inside the shell the tray tooltip names the job that runs, whichever screen
// started it (a BHEL sync, a folder import, the daily backup). It follows `/api/health` with a query observer outside
// React, polled every 2 s also while the window is hidden in the tray.
import type { RouteOutput } from "@senstosales/schemas";
import { type QueryClient, QueryObserver } from "@tanstack/react-query";

import type { Platform } from "../platform/index.ts";
import { apiQuery } from "./api.ts";

type HealthJob = NonNullable<RouteOutput<"health.get">["job"]>;

const APP = "SenstoSales";

const JOB_LABEL: Record<HealthJob["type"], string> = {
  "po.scrape": "BHEL PO sync",
  "srv.scrape": "BHEL SRV sync",
  "po.import-folder": "PO folder import",
  "srv.import-folder": "SRV folder import",
  "recompute-all": "Recalculation",
  backup: "Backup",
};

/** The tooltip: the app's name, and the job while one is queued or running. */
function trayText(job: HealthJob | null): string {
  if (job === null || (job.status !== "queued" && job.status !== "running")) return APP;
  return `${APP}: ${JOB_LABEL[job.type]} ${job.status === "queued" ? "waiting" : "running"}`;
}

/** Keeps the tray tooltip on the current job until the returned function stops it; each text is set once. */
export function followJobInTray(queryClient: QueryClient, setStatus: Platform["setTrayStatus"]): () => void {
  const observer = new QueryObserver(queryClient, {
    ...apiQuery("health.get"),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
  let shown: string | undefined;
  return observer.subscribe(({ data }) => {
    if (data === undefined) return;
    const text = trayText(data.job);
    if (text === shown) return;
    shown = text;
    void setStatus(text);
  });
}
