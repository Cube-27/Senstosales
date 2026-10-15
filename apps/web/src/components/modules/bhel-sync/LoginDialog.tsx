// The legacy BHEL login dialog (SPEC-19 §2): connecting, then the captcha, then the OTP, or the failure with Try Again.
// Every step has the same body height, so the dialog keeps its footprint (SPEC-19 §7). Only Cancel closes it. Each
// code field is uncontrolled and keyed by its step and captcha, so a new step starts empty without an effect.
import type { FormEvent } from "react";

import { AlertCircle, Loading, Shield } from "../../../lib/icons.ts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "../../common/index.ts";
import type { Login } from "./useBhelLogin.ts";

export interface LoginDialogProps {
  readonly login: Login;
  readonly submitting: boolean;
  onCaptcha(sessionId: string, code: string): void;
  onOtp(sessionId: string, code: string): void;
  onRetry(): void;
  onCancel(): void;
}

const TITLE: Record<Login["step"], string> = {
  idle: "",
  ready: "",
  connecting: "Connecting to BHEL…",
  captcha: "Enter CAPTCHA",
  otp: "Enter OTP",
  failed: "Login Failed",
};

const FORM_ID = "bhel-login-step";

function ErrorBanner({ message }: { readonly message: string | null }) {
  return (
    <p role="alert" className="flex min-h-9 items-start gap-2 role-helper-text text-error">
      {message && (
        <>
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {message}
        </>
      )}
    </p>
  );
}

/** The step's code from the submitted form, trimmed; empty codes are not sent. */
function submitted(event: FormEvent<HTMLFormElement>, send: (code: string) => void): void {
  event.preventDefault();
  const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
  if (code !== "") send(code);
}

function StepBody({ login, onCaptcha, onOtp }: Pick<LoginDialogProps, "login" | "onCaptcha" | "onOtp">) {
  switch (login.step) {
    case "captcha":
      return (
        <form
          id={FORM_ID}
          className="flex flex-col gap-3"
          onSubmit={(e) => submitted(e, (c) => onCaptcha(login.sessionId, c))}
        >
          <p className="role-helper-text">Enter the code shown in the image below:</p>
          <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-surface-sunken p-2">
            <img src={`data:image/png;base64,${login.captchaPng}`} alt="CAPTCHA" className="max-h-20 w-auto" />
          </div>
          <Input
            key={login.captchaPng}
            name="code"
            aria-label="CAPTCHA code"
            placeholder="Type CAPTCHA code"
            autoComplete="off"
            className="text-center tracking-widest"
            autoFocus
          />
          <ErrorBanner message={login.message} />
        </form>
      );
    case "otp":
      return (
        <form
          id={FORM_ID}
          className="flex flex-col gap-3"
          onSubmit={(e) => submitted(e, (c) => onOtp(login.sessionId, c))}
        >
          <p className="role-helper-text">An OTP was sent to your registered email. Enter it below:</p>
          <Input
            name="code"
            aria-label="OTP code"
            placeholder="OTP code"
            autoComplete="one-time-code"
            className="text-center tracking-widest"
            autoFocus
          />
          <ErrorBanner message={login.message} />
        </form>
      );
    case "failed":
      return (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertCircle className="size-10 text-error" aria-hidden />
          <p role="alert" className="role-body-text-sm text-error">
            {login.message}
          </p>
          <p className="role-helper-text">Check your network connection and try again.</p>
        </div>
      );
    default:
      return (
        <div role="status" className="flex flex-col items-center gap-3 py-8">
          <Loading className="size-7 animate-spin text-primary" aria-hidden />
          <p className="text-center role-helper-text">Launching browser and loading BHEL portal…</p>
        </div>
      );
  }
}

/** The step's one action in a fixed-width slot that is always there, so Cancel never moves (C8). */
function PrimaryAction({ login, submitting, onRetry }: Pick<LoginDialogProps, "login" | "submitting" | "onRetry">) {
  const slot = "w-28";
  switch (login.step) {
    case "captcha":
    case "otp":
      return (
        <Button size="sm" type="submit" form={FORM_ID} loading={submitting} className={slot}>
          {login.step === "otp" ? "Submit OTP" : "Submit"}
        </Button>
      );
    case "failed":
      return (
        <Button size="sm" onClick={onRetry} className={slot}>
          Try Again
        </Button>
      );
    default:
      return <span aria-hidden className={slot} />;
  }
}

export function LoginDialog({ login, submitting, onCaptcha, onOtp, onRetry, onCancel }: LoginDialogProps) {
  const open = login.step !== "idle" && login.step !== "ready";
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-sm"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4 text-primary" aria-hidden />
            {TITLE[login.step]}
          </DialogTitle>
          <DialogDescription className="sr-only">BHEL portal login</DialogDescription>
        </DialogHeader>
        <div className="h-64 py-2">
          <StepBody key={login.step} login={login} onCaptcha={onCaptcha} onOtp={onOtp} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <PrimaryAction login={login} submitting={submitting} onRetry={onRetry} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
