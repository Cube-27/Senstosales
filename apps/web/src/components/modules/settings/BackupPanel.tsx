// Backups in Settings (SPEC-21 §2, ARCHITECTURE §13.3): Backup now starts the `backup` job and follows it like any job
// (§7.3); Restore replaces the data with a listed backup after a plain confirmation, then reloads the app. The outcome
// of either shows in one reserved line, and the list is a fixed-height table, so nothing around the panel moves (C8).
import type { RouteOutput } from "@senstosales/schemas";
import { keepPreviousData, queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useClientPage } from "../../../hooks/useClientPage.ts";
import { api } from "../../../lib/api.ts";
import { cn } from "../../../lib/cn.ts";
import { isActive, type Job, jobQuery } from "../../../lib/jobs.ts";
import { reloadApp } from "../../../lib/reload.ts";
import { Button, type Column, ConfirmDialog, DataTable } from "../../common/index.ts";

type Backup = RouteOutput<"backups.list">[number];

/** The list as of the last finished backup: the key changes when one finishes, so the new copy is read then. */
const backupsQuery = (after: string | null) =>
  queryOptions({
    queryKey: ["backups.list", {}, after] as const,
    queryFn: () => api.request("backups.list"),
    placeholderData: keepPreviousData,
  });

const KIND_LABEL: Record<Backup["kind"], string> = {
  daily: "Daily",
  "pre-upgrade": "Before upgrade",
  safety: "Before restore",
};

const COLUMNS: Column<Backup>[] = [
  { key: "name", header: "Backup", width: "55%" },
  { key: "kind", header: "Type", width: "25%", render: (b) => KIND_LABEL[b.kind], title: (b) => KIND_LABEL[b.kind] },
];

type Outcome = { readonly text: string; readonly failed: boolean } | null;

/** The status line: a failed action's reason, else the backup's state (running or about to, saved, or why it did
 * not finish), else nothing before any action. */
function panelOutcome(error: Error | null, idle: boolean, job: Job | undefined): Outcome {
  if (error !== null) return { text: error.message, failed: true };
  if (idle) return null;
  if (job === undefined || isActive(job)) return { text: "Backing up...", failed: false };
  if (job.status === "done") return { text: "Backup saved.", failed: false };
  return { text: job.error ?? "The backup did not finish. Try again.", failed: true };
}

/** Backup now: starts the `backup` job and follows it through the shared job query. */
function useBackupNow() {
  const start = useMutation({ mutationFn: () => api.request("jobs.start", { body: { type: "backup" } }) });
  const jobId = start.data?.id;
  const job = useQuery({ ...jobQuery(jobId ?? ""), enabled: jobId !== undefined }).data?.job;
  const finished = job !== undefined && !isActive(job);
  return {
    start,
    job,
    /** The finished job's id, once there is one. */
    finishedId: finished ? job.id : null,
    running: start.isPending || (jobId !== undefined && !finished),
  };
}

export function BackupPanel() {
  const [chosen, setChosen] = useState<string | null>(null);
  const { start, job, finishedId, running: backingUp } = useBackupNow();
  const restore = useMutation({
    mutationFn: (name: string) => api.request("backups.restore", { body: { name } }),
    onSuccess: reloadApp,
    onError: () => setChosen(null),
  });
  const backups = useQuery(backupsQuery(finishedId));
  const paged = useClientPage(backups.data ?? []);

  // The latest action's outcome: starting either one resets the other.
  const outcome = panelOutcome(restore.error ?? start.error, start.isIdle, job);

  const columns: Column<Backup>[] = [
    ...COLUMNS,
    {
      key: "restore",
      header: "Action",
      width: "20%",
      align: "right",
      render: (b) => (
        <Button variant="outline" size="sm" disabled={backingUp} onClick={() => setChosen(b.name)}>
          Restore
        </Button>
      ),
    },
  ];

  return (
    <section aria-labelledby="backups-title" className="mt-4 rounded-lg border border-border/70 bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 id="backups-title" className="role-section-title">
          Backups
        </h2>
        <Button
          size="sm"
          loading={backingUp}
          disabled={restore.isPending}
          onClick={() => {
            restore.reset();
            start.mutate();
          }}
        >
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
        {...paged}
        columns={columns}
        rows={backups.data && paged.rows}
        state={backups.isError ? "error" : backups.data ? "ready" : "loading"}
        error="Backups could not be loaded."
        emptyText="No backups yet"
      />
      <ConfirmDialog
        open={chosen !== null}
        onClose={() => setChosen(null)}
        onConfirm={() => {
          start.reset();
          if (chosen !== null) restore.mutate(chosen);
        }}
        loading={restore.isPending}
        title="Restore this backup?"
        warningText={`Your current data will be replaced by ${chosen ?? ""}. A copy of your current data is saved first.`}
        confirmLabel="Restore"
        variant="danger"
      />
    </section>
  );
}
