// The BHEL login wizard's state (SPEC-19 §2, ARCHITECTURE §7.5): open a session and show its captcha, take the
// captcha (the API adds the supplier code and the stored password, INV-81), then the OTP. A wrong captcha or OTP is
// asked again in place with the portal's message (§4.2); any other failure ends the login with its plain message.
import type { RouteOutput } from "@senstosales/schemas";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../../lib/api.ts";

export type Login =
  | { readonly step: "idle" }
  | { readonly step: "connecting" }
  | {
      readonly step: "captcha";
      readonly sessionId: string;
      readonly captchaPng: string;
      readonly message: string | null;
    }
  | { readonly step: "otp"; readonly sessionId: string; readonly message: string | null }
  | { readonly step: "failed"; readonly message: string }
  | { readonly step: "ready"; readonly sessionId: string };

type Step = RouteOutput<"bhel.otp">;

const IDLE: Login = { step: "idle" };
const message = (error: unknown): string =>
  error instanceof Error ? error.message : "Could not reach the BHEL portal. Check your network connection.";

/** The next state after the API answered a captcha or an OTP for `sessionId`. */
function afterStep(sessionId: string, answer: Step): Login {
  switch (answer.step) {
    case "captcha":
      return { step: "captcha", sessionId, captchaPng: answer.captchaPng, message: answer.message };
    case "otp":
      return { step: "otp", sessionId, message: answer.message };
    case "ready":
      return { step: "ready", sessionId };
    default: {
      const unreachable: never = answer;
      return unreachable;
    }
  }
}

export function useBhelLogin() {
  const [login, setLogin] = useState<Login>(IDLE);
  const fail = (error: unknown) => setLogin({ step: "failed", message: message(error) });

  const start = useMutation({
    mutationFn: () => api.request("bhel.start"),
    onMutate: () => setLogin({ step: "connecting" }),
    onSuccess: ({ sessionId, captchaPng }) => setLogin({ step: "captcha", sessionId, captchaPng, message: null }),
    onError: fail,
  });
  const captcha = useMutation({
    mutationFn: ({ sessionId, code }: { sessionId: string; code: string }) =>
      api.request("bhel.captcha", { params: { sessionId }, body: { captcha: code } }),
    onSuccess: (answer, { sessionId }) => setLogin(afterStep(sessionId, answer)),
    onError: fail,
  });
  const otp = useMutation({
    mutationFn: ({ sessionId, code }: { sessionId: string; code: string }) =>
      api.request("bhel.otp", { params: { sessionId }, body: { otp: code } }),
    onSuccess: (answer, { sessionId }) => setLogin(afterStep(sessionId, answer)),
    onError: fail,
  });

  /** Ends the login: closes its portal session, if one is open, and forgets it. */
  function close(): void {
    if ("sessionId" in login)
      void api.request("bhel.close", { params: { sessionId: login.sessionId } }).catch(() => {});
    setLogin(IDLE);
  }

  return {
    login,
    submitting: captcha.isPending || otp.isPending,
    start: () => start.mutate(),
    submitCaptcha: (sessionId: string, code: string) => captcha.mutate({ sessionId, code }),
    submitOtp: (sessionId: string, code: string) => otp.mutate({ sessionId, code }),
    close,
  };
}
