import { fmtCount } from "@senstosales/schemas/formatters";
import { useEffect, useRef, useState } from "react";

import { Loading, Upload, X } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog.tsx";

/** One file's outcome, as the upload API reports it (accepted, skipped as older, failed with a reason). */
export interface UploadOutcome {
  readonly status: "accepted" | "skipped" | "failed";
  readonly reason: string | null;
}

export interface FileUploadModalProps {
  readonly open: boolean;
  onClose(): void;
  readonly files: readonly File[];
  /** Uploads one file; a throw counts as a failure with the error's message. */
  onUpload(file: File): Promise<UploadOutcome>;
  readonly title?: string;
}

type Phase = "uploading" | "cancelled" | "complete";
type Result = UploadOutcome & { readonly name: string };

const STATUS_TEXT: Record<Phase, { text: string; className: string }> = {
  uploading: { text: "Processing", className: "text-muted" },
  cancelled: { text: "Cancelled", className: "text-warning" },
  complete: { text: "Upload Complete", className: "text-success" },
};

async function uploadOne(onUpload: FileUploadModalProps["onUpload"], file: File): Promise<Result> {
  try {
    return { name: file.name, ...(await onUpload(file)) };
  } catch (error) {
    return { name: file.name, status: "failed", reason: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * The legacy upload modal: opening it with files uploads them one by one, with progress, the Success / Skipped /
 * Failed counts and, per file not accepted, the reason (SPEC-16). Cancel stops after the file in flight; the dialog
 * closes only when no upload runs.
 */
export function FileUploadModal({ open, onClose, files, onUpload, title = "Upload Files" }: FileUploadModalProps) {
  const [phase, setPhase] = useState<Phase>("uploading");
  const [results, setResults] = useState<readonly Result[]>([]);
  const cancelled = useRef(false);
  // The run reads the latest handler, so a new `onUpload` identity mid-run neither restarts nor breaks it.
  const upload = useRef(onUpload);
  useEffect(() => {
    upload.current = onUpload;
  });

  useEffect(() => {
    if (!open) return;
    if (files.length === 0) {
      setPhase("complete");
      return;
    }
    let live = true;
    cancelled.current = false;
    setPhase("uploading");
    setResults([]);
    void (async () => {
      for (const file of files) {
        if (cancelled.current || !live) break;
        const result = await uploadOne(upload.current, file);
        if (!live) return;
        setResults((done) => [...done, result]);
      }
      if (live) setPhase(cancelled.current ? "cancelled" : "complete");
    })();
    return () => {
      live = false;
    };
  }, [open, files]);

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
    <Dialog open={open} onOpenChange={(next) => !next && !uploading && onClose()}>
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
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                cancelled.current = true;
              }}
            >
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
