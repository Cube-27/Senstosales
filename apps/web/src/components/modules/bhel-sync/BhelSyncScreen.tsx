// BHEL sync on `/po/ingest-bhel` (SPEC-19 §2): the legacy ingest tab over the login wizard and the scrape jobs. Log
// in (captcha, then OTP), then Start runs `po.scrape` or `srv.scrape` with the session, shown by the shared
// JobProgress. The job closes the session when it ends (D-0379), so the login is over from then on: that is derived
// from the job, not stored. One job runs at a time (INV-98).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../../lib/api.ts";
import { ArrowRightLeft, CheckCircle } from "../../../lib/icons.ts";
import { isActive, type Job, jobQuery } from "../../../lib/jobs.ts";
import { ButtonGroup, PageHeader, useToast } from "../../common/index.ts";
import { bhelPasswordQuery, supplierQuery } from "../settings/useSettings.ts";
import { LoginDialog } from "./LoginDialog.tsx";
import { DEFAULT_CONFIG, type Kind, type PipelineConfig, type ScrapeBody, scrapeBody } from "./scrape.ts";
import { AuthCard, ControlCard, PipelineCard } from "./SyncCards.tsx";
import { type Login, useBhelLogin } from "./useBhelLogin.ts";

const KINDS = [
  { id: "PO", label: "PO Ingestion" },
  { id: "SRV", label: "SRV Ingestion" },
] as const satisfies ReadonlyArray<{ id: Kind; label: string }>;

interface Run {
  readonly kind: Kind;
  readonly jobId: string;
  readonly sessionId: string;
}

/** What the screen shows, derived from the login, the last run and its job; nothing here is stored. */
function syncState(args: {
  readonly login: Login;
  readonly run: Run | null;
  readonly job: Job | undefined;
  readonly kind: Kind;
  readonly config: PipelineConfig;
}) {
  const { login, run, job } = args;
  const running = run !== null && (job === undefined || isActive(job));
  const sessionId = login.step === "ready" ? login.sessionId : null;
  // The run's job closes its session when it ends (D-0379).
  const authenticated = sessionId !== null && !(run?.sessionId === sessionId && !running);
  const request = authenticated ? scrapeBody(args.kind, sessionId, args.config) : null;
  const configError = request !== null && "error" in request ? request.error : null;
  return { running, authenticated, request, configError };
}

/** Why Start is disabled, or null. */
function startBlockedBy(state: ReturnType<typeof syncState>, starting: boolean): string | null {
  if (!state.authenticated) return "Login to BHEL first";
  if (state.running) return "A sync is running";
  if (state.configError !== null) return state.configError;
  return starting ? "Starting" : null;
}

export function BhelSyncScreen() {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("PO");
  const [configs, setConfigs] = useState<Record<Kind, PipelineConfig>>({ PO: DEFAULT_CONFIG, SRV: DEFAULT_CONFIG });
  const [run, setRun] = useState<Run | null>(null);
  const wizard = useBhelLogin();
  const { login } = wizard;
  const supplier = useQuery(supplierQuery);
  const password = useQuery(bhelPasswordQuery);
  const job = useQuery({ ...jobQuery(run?.jobId ?? ""), enabled: run !== null }).data?.job;
  const state = syncState({ login, run, job, kind, config: configs[kind] });
  const { running, authenticated, request } = state;

  const start = useMutation({
    mutationFn: (body: ScrapeBody) => api.request("jobs.start", { body }),
    onSuccess: (started, body) => setRun({ kind, jobId: started.id, sessionId: body.sessionId }),
    onError: (error) => toast("Could not start", error instanceof Error ? error.message : "Try again.", "error"),
  });
  const shown = run?.kind === kind ? run : null;

  return (
    <div className="flex flex-col gap-4 [overflow-anchor:none]">
      <PageHeader
        title="B2B Supply Chain Ingestion"
        subtitle="Automated procurement synchronization with BHEL vendor portal"
        backTo="/po"
      />
      <ButtonGroup label="Ingestion type" options={KINDS} value={kind} onChange={setKind} />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
        <AuthCard
          supplierCode={supplier.data?.bhelSupplierCode}
          passwordSaved={password.data?.saved}
          authenticated={authenticated}
          connecting={login.step === "connecting"}
          running={running}
          onLogin={wizard.start}
          onLogout={() => {
            wizard.close();
            toast("Logged Out", "Session ended.", "info");
          }}
        />
        <ControlCard
          kind={kind}
          jobId={shown?.jobId ?? null}
          job={shown ? job : undefined}
          running={shown !== null && running}
          authenticated={authenticated}
          startBlockedBy={startBlockedBy(state, start.isPending)}
          starting={start.isPending}
          onStart={() => request && "body" in request && start.mutate(request.body)}
          onReset={() => setRun(null)}
        />
      </div>
      <PipelineCard
        kind={kind}
        config={configs[kind]}
        enabled={authenticated && !running}
        error={state.configError}
        onChange={(config) => setConfigs((all) => ({ ...all, [kind]: config }))}
      />
      <p className="flex items-center gap-2 px-1 role-helper-text">
        <CheckCircle className="size-3.5 shrink-0 text-tertiary" aria-hidden />
        Credentials are stored locally and never leave your machine. Login runs in a headless browser.
      </p>
      <div className="flex items-center justify-center gap-2 border-t border-border py-3">
        <ArrowRightLeft className="size-3.5 text-tertiary" aria-hidden />
        <span className="role-helper-text">Single Active Pipeline Per Session</span>
      </div>
      <LoginDialog
        login={login}
        submitting={wizard.submitting}
        onSubmit={wizard.submit}
        onRetry={wizard.start}
        onCancel={wizard.close}
      />
    </div>
  );
}
