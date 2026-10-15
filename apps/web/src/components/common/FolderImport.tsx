import { fmtCount } from "@senstosales/schemas/formatters";
import { useState } from "react";

import { api } from "../../lib/api.ts";
import { FolderOpen, Loading } from "../../lib/icons.ts";
import { pickHtmlFolder, stageFolder } from "../../lib/upload.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog.tsx";
import { JobProgress } from "./JobProgress.tsx";

export interface FolderImportProps {
  readonly open: boolean;
  onClose(): void;
  /** Called when an import job ends, so the screen behind can refresh. */
  onImported?(): void;
}

type Kind = "po" | "srv";

/** One folder's import: not started, its files uploading to staging, its job, or a message why it did not start. */
type Run =
  | { readonly step: "idle" }
  | { readonly step: "staging"; readonly count: number }
  | { readonly step: "job"; readonly jobId: string; readonly tooLarge: readonly string[]; readonly ended: boolean }
  | { readonly step: "error"; readonly message: string };

const IDLE: Run = { step: "idle" };
const LABEL: Record<Kind, string> = { po: "PO", srv: "SRV" };
const STEP: Record<Kind, string> = { po: "1.", srv: "2." };

const running = (run: Run) => run.step === "staging" || (run.step === "job" && !run.ended);

/** Picks a folder, stages its HTML files and starts the folder-import job; never throws. */
async function startImport(kind: Kind, update: (run: Run) => void): Promise<void> {
  try {
    const files = await pickHtmlFolder();
    if (files === null) return;
    if (files.length === 0) {
      update({ step: "error", message: "No HTML files found in this folder." });
      return;
    }
    update({ step: "staging", count: files.length });
    const staged = await stageFolder(kind, files);
    if (staged.stagingId === null) {
      update({ step: "error", message: "None of the files could be uploaded: each is larger than 10 MB." });
      return;
    }
    const type = kind === "po" ? "po.import-folder" : "srv.import-folder";
    const job = await api.request("jobs.start", { body: { type, stagingId: staged.stagingId } });
    update({ step: "job", jobId: job.id, tooLarge: staged.tooLarge, ended: false });
  } catch (error) {
    update({ step: "error", message: error instanceof Error ? error.message : "The import could not start." });
  }
}

function FolderStep(props: {
  readonly kind: Kind;
  readonly run: Run;
  readonly disabled: boolean;
  onPick(): void;
  onEnd(): void;
}) {
  const { kind, run } = props;
  const label = LABEL[kind];
  return (
    <section aria-label={`${label} folder`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="role-section-title">
          {STEP[kind]} {label} folder
        </h3>
        <Button variant="outline" size="sm" disabled={props.disabled || running(run)} onClick={props.onPick}>
          <FolderOpen aria-hidden />
          Choose {label} folder
        </Button>
      </div>
      {/* Every step fills the same box, so moving between them moves nothing (C8). */}
      <div className="h-72">
        {run.step === "job" ? (
          <div className="flex h-full flex-col gap-1">
            <JobProgress key={run.jobId} jobId={run.jobId} onEnd={props.onEnd} />
            <p className="truncate role-helper-text text-warning" title={run.tooLarge.join(", ")}>
              {run.tooLarge.length > 0 && `Not uploaded (larger than 10 MB): ${run.tooLarge.join(", ")}`}
            </p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 rounded-lg bg-surface-sunken/50 p-4 text-center">
            {run.step === "staging" && <Loading className="size-4 animate-spin" aria-hidden />}
            <p role={run.step === "error" ? "alert" : undefined} className="role-helper-text">
              {run.step === "staging" && `Uploading ${fmtCount(run.count)} files...`}
              {run.step === "error" && <span className="text-error">{run.message}</span>}
              {run.step === "idle" && `Choose the folder of saved BHEL ${label} pages.`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Folder import (ARCHITECTURE §7.4, SPEC-16): pick a folder of PO pages, then one of SRV pages; each is staged and
 * imported by a background job whose progress and summary show in place. The dialog closes only when nothing runs.
 */
export function FolderImport({ open, onClose, onImported }: FolderImportProps) {
  const [runs, setRuns] = useState<Record<Kind, Run>>({ po: IDLE, srv: IDLE });
  const busy = running(runs.po) || running(runs.srv);
  const update = (kind: Kind) => (run: Run) => setRuns((all) => ({ ...all, [kind]: run }));
  const ended = (kind: Kind) => () => {
    setRuns((all) => {
      const run = all[kind];
      return run.step === "job" ? { ...all, [kind]: { ...run, ended: true } } : all;
    });
    onImported?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || busy) return;
        setRuns({ po: IDLE, srv: IDLE });
        onClose();
      }}
    >
      <DialogContent className="max-w-[var(--modal-width-xl)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-surface-sunken/50 px-4 py-3">
          <DialogTitle>
            <FolderOpen className="size-4 text-accent" aria-hidden />
            Import Folders
          </DialogTitle>
          <DialogDescription>Import POs first, then SRVs.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {(["po", "srv"] as const).map((kind) => (
            <FolderStep
              key={kind}
              kind={kind}
              run={runs[kind]}
              // One job runs at a time (INV-98); POs go first so SRV lines find their POs (§7.4).
              disabled={running(runs[kind === "po" ? "srv" : "po"])}
              onPick={() => void startImport(kind, update(kind))}
              onEnd={ended(kind)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
