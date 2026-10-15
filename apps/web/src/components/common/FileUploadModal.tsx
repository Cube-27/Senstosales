import { fmtCount } from "@senstosales/schemas/formatters";
import { useSyncExternalStore } from "react";

import { Loading, Upload, X } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog.tsx";

/** One file's outcome, as the upload API reports it (accepted, skipped as older, failed with a reason). */
export interface UploadOutcome {
  readonly status: "accepted" | "skipped" | "failed";
  readonly reason: string | null;
}

type Phase = "uploading" | "cancelled" | "complete";
type Result = UploadOutcome & { readonly name: string };

interface UploadState {
  readonly phase: Phase;
  readonly results: readonly Result[];
}

/** One upload run: started by the handler that picked the files, shown by {@link FileUploadModal}. */
export interface UploadRun {
  readonly files: readonly File[];
  subscribe(listener: () => void): () => void;
  state(): UploadState;
  /** Stops after the file in flight. */
  cancel(): void;
}

export interface FileUploadModalProps {
  /** The run to show; null keeps the dialog closed. */
  readonly run: UploadRun | null;
  onClose(): void;
  readonly title?: string;
}

const STATUS_TEXT: Record<Phase, { text: string; className: string }> = {
  uploading: { text: "Processing", className: "text-muted" },
  cancelled: { text: "Cancelled", className: "text-warning" },
  complete: { text: "Upload Complete", className: "text-success" },
};

type Upload = (file: File) => Promise<UploadOutcome>;

async function uploadOne(onUpload: Upload, file: File): Promise<Result> {
  try {
    return { name: file.name, ...(await onUpload(file)) };
  } catch (error) {
    return { name: file.name, status: "failed", reason: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * Uploads `files` one by one through `onUpload` (a throw counts as a failure with the error's message). Cancelling,
 * or closing the screen that shows the run, stops it after the file in flight.
 */
export function startUpload(files: readonly File[], onUpload: Upload): UploadRun {
  let state: UploadState = { phase: files.length === 0 ? "complete" : "uploading", results: [] };
  let cancelled = false;
  let shown = false;
  const listeners = new Set<() => void>();
  const update = (next: Partial<UploadState>): void => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  // A screen that showed the run and no longer does was closed; React re-subscribes within the same task (StrictMode),
  // so the check before each next file sees only a real close.
  const stopped = (): boolean => cancelled || (shown && listeners.size === 0);
  void (async () => {
    for (const file of files) {
      if (stopped()) break;
      const result = await uploadOne(onUpload, file);
      update({ results: [...state.results, result] });
    }
    if (files.length > 0) update({ phase: cancelled ? "cancelled" : "complete" });
  })();
  return {
    files,
    subscribe(listener) {
      shown = true;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state: () => state,
    cancel() {
      cancelled = true;
    },
  };
}

/** What a closed dialog shows: nothing runs. One state object, so the store reads as unchanged. */
const IDLE_STATE: UploadState = { phase: "complete", results: [] };
const IDLE: UploadRun = { files: [], subscribe: () => () => {}, state: () => IDLE_STATE, cancel() {} };

/**
 * The legacy upload modal: shows a run's progress, the Success / Skipped / Failed counts and, per file not accepted,
 * the reason (SPEC-16). Cancel stops after the file in flight; the dialog closes only when no upload runs.
 */
export function FileUploadModal({ run, onClose, title = "Upload Files" }: FileUploadModalProps) {
  const shown = run ?? IDLE;
  const { phase, results } = useSyncExternalStore(shown.subscribe, shown.state);
  const { files } = shown;

  const uploading = phase === "uploading";
  const count = { accepted: 0, skipped: 0, failed: 0 };
  for (const r of results) count[r.status] += 1;
  const percent = files.length === 0 ? 0 : Math.round((results.length / files.length) * 100);
  const status = STATUS_TEXT[phase];
  const notAccepted = results.filter((r) => r.status !== "accepted");
  const stats = [
    { label: "Success", value: count.accepted, className: "text-success" },
    { label: "Skipped", value: count.skipped, className: count.skipped > 0 ? "text-warning" : "text-tertiary" },
    { label: "Failed", value: count.failed, className: count.failed > 0 ? "text-error" : "text-tertiary" },
  ];

  return (
    <Dialog open={run !== null} onOpenChange={(next) => !next && !uploading && onClose()}>
      <DialogContent className="max-w-[var(--modal-width-sm)] gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="border-b border-border bg-surface-sunken/50 px-4 py-3">
          <DialogTitle>
            <Upload className="size-4 text-accent" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Upload progress and status for {fmtCount(files.length)} files
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <div className="flex justify-between role-body-text-sm">
              <span className="text-muted">Progress</span>
              <span className="text-foreground tabular-nums">
                {fmtCount(results.length)} / {fmtCount(files.length)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-label="Upload progress"
              aria-valuenow={percent}
            >
              <div
                className={cn("h-full rounded-full bg-primary transition-all", phase === "cancelled" && "bg-warning")}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className={cn("flex items-center justify-center gap-2 role-body-text-sm", status.className)}>
              {uploading && <Loading className="size-3 animate-spin" aria-hidden />}
              {uploading ? `${status.text} ${percent}%` : status.text}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken/50 p-3">
            {stats.map((stat, i) => (
              <div key={stat.label} className="flex flex-1 items-center gap-3">
                {i > 0 && <div className="h-8 w-px bg-border" />}
                <div className="flex-1 text-center">
                  <div className={cn("role-heading-md", stat.className)}>{fmtCount(stat.value)}</div>
                  <div className="role-helper-text">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
          {notAccepted.length > 0 && (
            <ul
              className="max-h-40 space-y-1 overflow-auto rounded-lg border border-border p-2"
              aria-label="Files not uploaded"
            >
              {notAccepted.map((r) => (
                <li key={r.name} className="flex gap-2 role-body-text-sm">
                  <span className="min-w-0 truncate" title={r.name}>
                    {r.name}
                  </span>
                  <span className={cn("ml-auto shrink-0", r.status === "failed" ? "text-error" : "text-warning")}>
                    {r.reason ?? (r.status === "skipped" ? "Skipped" : "Failed")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {uploading ? (
            <Button variant="outline" size="sm" className="w-full" onClick={shown.cancel}>
              <X aria-hidden />
              Cancel
            </Button>
          ) : (
            <Button size="sm" className="w-full" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
