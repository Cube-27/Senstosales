// Backups in Settings (SPEC-21 §2, ARCHITECTURE §13.3): Backup now runs the `backup` job and waits for it; Restore
// replaces the data with a listed backup after a plain confirmation, then reloads the app. The outcome of either shows
// in one reserved line, and the list is a fixed-height table, so nothing around the panel moves (C8).
import type { RouteOutput } from "@senstosales/schemas";
import { PAGE_SIZES } from "@senstosales/schemas/paging";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiQuery } from "../../../lib/api.ts";
import { cn } from "../../../lib/cn.ts";
import { reloadApp } from "../../../lib/reload.ts";
import { Button, type Column, ConfirmDialog, DataTable } from "../../common/index.ts";

type Backup = RouteOutput<"backups.list">[number];
type Job = RouteOutput<"jobs.start">;

const backupsQuery = apiQuery("backups.list");

const KIND_LABEL: Record<Backup["kind"], string> = {
  daily: "Daily",
  "pre-upgrade": "Before upgrade",
  safety: "Before restore",
};

/** The UI polls a job every 2 s (ARCHITECTURE §7.3). */
const POLL_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isActive = (job: Job): boolean => job.status === "queued" || job.status === "running";

/** Starts the backup job and resolves once it has ended; a job that did not finish rejects with its reason. */
async function runBackup(): Promise<void> {
  let job = await api.request("jobs.start", { body: { type: "backup" } });
  for (;;) {
    job = (await api.request("jobs.detail", { params: { id: job.id } })).job;
    if (!isActive(job)) break;
    await sleep(POLL_MS);
  }
  if (job.status !== "done") throw new Error(job.error ?? "The backup did not finish. Try again.");
}

const message = (error: unknown): string => (error instanceof Error ? error.message : "Something went wrong.");

export function BackupPanel() {
  const queryClient = useQueryClient();
  const backups = useQuery(backupsQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; failed: boolean } | null>(null);

  const backup = useMutation({
    mutationFn: runBackup,
    onMutate: () => setOutcome({ text: "Backing up...", failed: false }),
    onSuccess: async () => {
      setOutcome({ text: "Backup saved.", failed: false });
      await queryClient.invalidateQueries({ queryKey: backupsQuery.queryKey });
    },
    onError: (error) => setOutcome({ text: message(error), failed: true }),
  });

  const restore = useMutation({
    mutationFn: (name: string) => api.request("backups.restore", { body: { name } }),
    onSuccess: reloadApp,
    onError: (error) => {
      setChosen(null);
      setOutcome({ text: message(error), failed: true });
    },
  });

  const columns: Column<Backup>[] = [
    { key: "name", header: "Backup", width: "55%" },
    { key: "kind", header: "Type", width: "25%", render: (b) => KIND_LABEL[b.kind], title: (b) => KIND_LABEL[b.kind] },
    {
      key: "restore",
      header: "Action",
      width: "20%",
      align: "right",
      render: (b) => (
        <Button variant="outline" size="sm" disabled={backup.isPending} onClick={() => setChosen(b.name)}>
          Restore
        </Button>
      ),
    },
  ];
  const rows = backups.data ?? [];
  const start = (page - 1) * pageSize;

  return (
    <section aria-labelledby="backups-title" className="mt-4 rounded-lg border border-border/70 bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 id="backups-title" className="role-section-title">
          Backups
        </h2>
        <Button size="sm" loading={backup.isPending} disabled={restore.isPending} onClick={() => backup.mutate()}>
          Backup now
        </Button>
      </div>
      <p className="role-helper-text">
        A copy of your data is saved on the first launch each day. Restore replaces your current data with a backup.
      </p>
      <p role="status" className={cn("my-2 h-5 truncate role-helper-text", outcome?.failed && "text-error")}>
        {outcome?.text ?? ""}
      </p>
      <DataTable
        columns={columns}
        rows={backups.data && rows.slice(start, start + pageSize)}
        total={rows.length}
        page={page}
        pageSize={pageSize}
        state={backups.isError ? "error" : backups.data ? "ready" : "loading"}
        error="Backups could not be loaded."
        emptyText="No backups yet"
        onPage={setPage}
        onPageSize={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        onSort={() => {}}
      />
      <ConfirmDialog
        open={chosen !== null}
        onClose={() => setChosen(null)}
        onConfirm={() => chosen && restore.mutate(chosen)}
        loading={restore.isPending}
        title="Restore this backup?"
        warningText={`Your current data will be replaced by ${chosen ?? ""}. A copy of your current data is saved first.`}
        confirmLabel="Restore"
        variant="danger"
      />
    </section>
  );
}
