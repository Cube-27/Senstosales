// The cards of the legacy BHEL ingest tab (SPEC-19 §2): Authentication, Status & Control and Pipeline Configuration.
// The supplier code and the BHEL password come from Settings (A-17, INV-81): this screen shows them as set or not,
// with a link there, and never asks for the password. Every slot that changes is reserved, so nothing moves (C8).
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "../../../lib/cn.ts";
import { CheckCircle, Info, Lock, Monitor, Play, Reset, Shield } from "../../../lib/icons.ts";
import type { Job } from "../../../lib/jobs.ts";
import {
  Button,
  Input,
  JobProgress,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from "../../common/index.ts";
import { filterIds, type Kind, MAX_BATCH, type PipelineConfig } from "./scrape.ts";

const CARD = "rounded-xl border border-border/70 bg-surface p-4";

/** The legacy "More information" popover beside a configuration label. */
function InfoPopover({ text }: { readonly text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More information" className="text-tertiary">
          <Info className="size-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-72">
        <p className="role-helper-text">{text}</p>
      </PopoverContent>
    </Popover>
  );
}

function SectionTitle({ children }: { readonly children: ReactNode }) {
  return <h2 className="mb-3 role-section-title">{children}</h2>;
}

/** The stored BHEL password as the card shows it: only whether it is saved (INV-81); nothing before it loads. */
function passwordStatus(saved: boolean | undefined): string {
  if (saved === undefined) return "";
  return saved ? "Saved" : "Not saved";
}

export interface AuthCardProps {
  readonly supplierCode: string | null | undefined;
  readonly passwordSaved: boolean | undefined;
  readonly authenticated: boolean;
  readonly connecting: boolean;
  readonly running: boolean;
  onLogin(): void;
  onLogout(): void;
}

export function AuthCard(props: Readonly<AuthCardProps>) {
  const { supplierCode, passwordSaved, authenticated } = props;
  return (
    <section aria-labelledby="bhel-auth" className={CARD}>
      <SectionTitle>
        <span id="bhel-auth">Authentication</span>
      </SectionTitle>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-36 flex-col gap-1">
          <Label htmlFor="bhel-supplier-code">Supplier Code</Label>
          <Input id="bhel-supplier-code" value={supplierCode ?? ""} placeholder="Not set" readOnly disabled />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <span className="role-field-label">Password</span>
          <span className="flex h-8 items-center role-body-text-sm">{passwordStatus(passwordSaved)}</span>
        </div>
        <Link to="/settings" className="flex h-8 items-center role-reference-link">
          Change in Settings
        </Link>
        <div className="flex-1" />
        {authenticated ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 role-body-text-xs text-success">
              <CheckCircle className="size-3.5" aria-hidden />
              Authenticated
            </span>
            <Button variant="ghost" size="sm" onClick={props.onLogout} disabled={props.running}>
              <Lock className="size-3.5" aria-hidden />
              Logout
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={props.onLogin} loading={props.connecting}>
            <Shield className="size-3.5" aria-hidden />
            Login to BHEL
          </Button>
        )}
      </div>
    </section>
  );
}

/** The legacy status line for a run's job, or the stand-by line with no run. */
function statusLine(kind: Kind, job: Job | undefined, hasRun: boolean): { label: string; message: string } {
  if (!hasRun) return { label: `${kind} Standby`, message: `Ready to start ${kind} ingestion` };
  switch (job?.status) {
    case undefined:
    case "queued":
      return { label: "Connecting", message: "" };
    case "running":
      return { label: kind === "SRV" ? "Checking Portal" : "Downloading", message: "" };
    case "done":
      return { label: "Done", message: "" };
    case "cancelled":
      return { label: "Cancelled", message: "" };
    case "failed":
      return { label: "Error", message: job.error ?? "" };
  }
}

/** The status dot: pulsing while the run is active, then done or error; grey before a run. */
function dotTone(running: boolean, ended: boolean, job: Job | undefined): Tone {
  if (running) return "active";
  if (!ended) return "idle";
  return job?.status === "failed" ? "error" : "done";
}

type Tone = "idle" | "active" | "done" | "error";

function StatusDot({ tone }: { readonly tone: Tone }) {
  const color = { idle: "bg-border", active: "bg-primary animate-pulse", done: "bg-success", error: "bg-error" }[tone];
  return <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", color)} />;
}

export interface ControlCardProps {
  readonly kind: Kind;
  /** The job of this kind's last run, or null with none. */
  readonly jobId: string | null;
  readonly job: Job | undefined;
  /** The run's job is queued or running. */
  readonly running: boolean;
  readonly authenticated: boolean;
  /** Why Start is disabled, or null when it can start. */
  readonly startBlockedBy: string | null;
  readonly starting: boolean;
  onStart(): void;
  onReset(): void;
}

export function ControlCard({ kind, jobId, job, running, authenticated, ...props }: Readonly<ControlCardProps>) {
  const ended = jobId !== null && !running;
  const { label, message } = statusLine(kind, job, jobId !== null);
  const tone = dotTone(running, ended, job);
  return (
    <section aria-labelledby="bhel-status" className={CARD}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <StatusDot tone={tone} />
          <div className="min-w-0">
            <h3 id="bhel-status" className="role-heading-sm">
              {label}
            </h3>
            <p className="mt-0.5 h-5 truncate role-helper-text" title={message}>
              {message}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className={cn(!ended && "invisible")} onClick={props.onReset}>
            <Reset className="size-3.5" aria-hidden />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={props.onStart}
            disabled={props.startBlockedBy !== null}
            loading={props.starting || running}
            title={props.startBlockedBy ?? undefined}
          >
            <Play className="size-3.5" aria-hidden />
            {running ? "Running" : "Start"}
          </Button>
        </div>
      </div>
      {/* The progress panel's footprint, held before a run too (C8). */}
      <div className="mt-4 h-60 border-t border-border/40 pt-3">
        {jobId !== null ? (
          <JobProgress key={jobId} jobId={jobId} />
        ) : (
          !authenticated && (
            <p className="flex items-center gap-2 role-helper-text">
              <Monitor className="size-3.5 shrink-0 text-tertiary" aria-hidden />
              Login to BHEL portal above to enable ingestion
            </p>
          )
        )}
      </div>
    </section>
  );
}

export interface PipelineCardProps {
  readonly kind: Kind;
  readonly config: PipelineConfig;
  readonly enabled: boolean;
  /** Why the configuration cannot start a run, or null. */
  readonly error: string | null;
  onChange(config: PipelineConfig): void;
}

export function PipelineCard({ kind, config, enabled, error, onChange }: Readonly<PipelineCardProps>) {
  const count = filterIds(config.poNumbers).length;
  const filterId = `${kind.toLowerCase()}-po-numbers`;
  return (
    <section
      aria-labelledby="bhel-pipeline"
      className={cn(CARD, !enabled && "pointer-events-none opacity-50 select-none")}
      inert={!enabled}
    >
      <SectionTitle>
        <span id="bhel-pipeline">Pipeline Configuration</span>
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.35fr)]">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-surface-sunken/20 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Label htmlFor={`${kind}-batch-limit`}>Batch Limit</Label>
            <InfoPopover
              text={`Max ${kind === "PO" ? "POs" : "SRVs"} to download per run (1–${MAX_BATCH.toLocaleString("en-IN")})`}
            />
          </div>
          <Input
            id={`${kind}-batch-limit`}
            type="number"
            min={1}
            max={MAX_BATCH}
            value={config.limit}
            onChange={(e) => onChange({ ...config, limit: e.target.value })}
            className="w-24 text-right"
          />
        </div>
        <div className="rounded-lg border border-border/40 bg-surface-sunken/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Label htmlFor={filterId}>{kind === "PO" ? "PO Number Filter" : "PO Filter For SRV Lookup"}</Label>
              <InfoPopover
                text={
                  kind === "PO"
                    ? "Optional. Leave blank to download all available POs."
                    : "Enter PO numbers to check whether each PO has an SRV available on the BHEL portal."
                }
              />
              <span className="role-helper-text">— optional</span>
            </div>
            <span className={cn("role-body-text-xs", count === 0 && "invisible")}>
              {count} PO{count === 1 ? "" : "s"} specified
            </span>
          </div>
          <Textarea
            id={filterId}
            rows={5}
            value={config.poNumbers}
            onChange={(e) => onChange({ ...config, poNumbers: e.target.value })}
            placeholder="e.g. 4500001, 4500002, 4500003  (leave blank for all)"
            className="resize-none"
          />
        </div>
      </div>
      <p role="alert" className="mt-2 h-5 truncate role-helper-text text-error">
        {error ?? ""}
      </p>
    </section>
  );
}
