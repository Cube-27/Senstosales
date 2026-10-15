import { fmtCount, fmtFlagType } from "@senstosales/schemas/formatters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { Loading, X } from "../../lib/icons.ts";
import { isActive, type Job, jobQuery, jobSummary } from "../../lib/jobs.ts";
import { Button } from "../ui/button.tsx";
import { useToast } from "./Toast.tsx";

export interface JobProgressProps {
  readonly jobId: string;
  /** Called once, with the job, when it stops running (done, failed or cancelled). */
  onEnd?(job: Job): void;
}

const STATUS_TEXT: Record<Job["status"], { text: string; className: string }> = {
  queued: { text: "Waiting to start", className: "text-muted" },
  running: { text: "Importing", className: "text-muted" },
  done: { text: "Import Complete", className: "text-success" },
  failed: { text: "Import Failed", className: "text-error" },
  cancelled: { text: "Cancelled", className: "text-warning" },
};

/** The issue list: the document in progress while the job runs, then the skipped and failed files with reasons. */
function Details({ job }: { readonly job: Job }) {
  const summary = jobSummary(job);
  if (isActive(job) || summary === null) {
    return (
      <p className="truncate p-2 role-helper-text" title={job.progress.current ?? undefined}>
        {job.error ?? (job.progress.current ? `Current: ${job.progress.current}` : "")}
      </p>
    );
  }
  const issues = [
    ...summary.skippedDocuments.map((d) => ({ ...d, failed: false })),
    ...summary.failedDocuments.map((d) => ({ ...d, failed: true })),
  ];
  const flags = Object.entries(summary.flags).filter(([, count]) => count > 0);
  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="role-body-text-sm">
        {flags.length === 0
          ? "No flags raised"
          : `Flags raised: ${flags.map(([type, count]) => `${fmtFlagType(type)} ${fmtCount(count)}`).join(", ")}`}
      </p>
      <ul aria-label="Files not imported" className="space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.failed}-${issue.document}`} className="flex gap-2 role-body-text-sm">
            <span className="min-w-0 truncate" title={issue.document}>
              {issue.document}
            </span>
            <span className={cn("ml-auto shrink-0", issue.failed ? "text-error" : "text-warning")}>{issue.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NOT_STARTED: Job["progress"] = { total: 0, done: 0, skipped: 0, failed: 0, current: null };

/** The status line, the bar and the four counts; before the first poll, a queued job with nothing done. */
function ProgressBar({ job, active }: { readonly job: Job | undefined; readonly active: boolean }) {
  const progress = job?.progress ?? NOT_STARTED;
  const processed = progress.done + progress.skipped + progress.failed;
  const percent = progress.total === 0 ? 0 : Math.floor((processed * 100) / progress.total);
  const status = STATUS_TEXT[job?.status ?? "queued"];
  const stats = [
    { label: "Total", value: progress.total, className: "text-foreground" },
    { label: "Done", value: progress.done, className: "text-success" },
    { label: "Skipped", value: progress.skipped, className: progress.skipped > 0 ? "text-warning" : "text-tertiary" },
    { label: "Failed", value: progress.failed, className: progress.failed > 0 ? "text-error" : "text-tertiary" },
  ];
  return (
    <>
      <div className="space-y-2">
        <div className="flex justify-between role-body-text-sm">
          <span className={cn("flex items-center gap-2", status.className)}>
            {active && <Loading className="size-3 animate-spin" aria-hidden />}
            {job?.cancelRequested && active ? "Cancelling..." : status.text}
          </span>
          <span className="text-foreground tabular-nums">
            {fmtCount(processed)} / {fmtCount(progress.total)}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-label="Job progress"
          aria-valuenow={percent}
        >
          <div
            className={cn("h-full rounded-full bg-primary transition-all", job?.status === "cancelled" && "bg-warning")}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="flex items-center rounded-lg border border-border bg-surface-sunken/50 p-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex-1 text-center">
            <div className={cn("role-heading-md tabular-nums", stat.className)}>{fmtCount(stat.value)}</div>
            <div className="role-helper-text">{stat.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * A background job's progress (ARCHITECTURE §7.3, §7.4), polled every 2 s while it runs: total, done, skipped,
 * failed and the current document, with Cancel; once it ends, its summary (skipped and failed files with reasons,
 * flags by type). The panel keeps one footprint throughout, so polling moves nothing (C8). Shared with SPEC-19.
 */
export function JobProgress({ jobId, onEnd }: JobProgressProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery(jobQuery(jobId));
  const job = query.data?.job;
  const [cancelling, setCancelling] = useState(false);
  const ended = useRef(false);
  const notify = useRef(onEnd);
  useEffect(() => {
    notify.current = onEnd;
  });
  useEffect(() => {
    if (job === undefined || isActive(job) || ended.current) return;
    ended.current = true;
    notify.current?.(job);
  }, [job]);

  async function cancel() {
    setCancelling(true);
    try {
      const updated = await api.request("jobs.cancel", { params: { id: jobId } });
      queryClient.setQueryData(jobQuery(jobId).queryKey, (old) => old && { ...old, job: updated });
    } catch (error) {
      toast("Cancel failed", error instanceof Error ? error.message : "The job could not be cancelled.", "error");
    } finally {
      setCancelling(false);
    }
  }

  const active = job === undefined || isActive(job);
  return (
    <div className="flex flex-col gap-3" aria-busy={active}>
      <ProgressBar job={job} active={active} />
      <div className="h-24 overflow-y-auto rounded-lg border border-border">{job && <Details job={job} />}</div>
      <Button
        variant="outline"
        size="sm"
        className={cn("w-full", !active && "invisible")}
        disabled={cancelling || job?.cancelRequested === true}
        onClick={() => void cancel()}
      >
        <X aria-hidden />
        Cancel
      </Button>
    </div>
  );
}
