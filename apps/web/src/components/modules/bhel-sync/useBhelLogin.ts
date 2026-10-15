// The BHEL login wizard's state (SPEC-19 §2, ARCHITECTURE §7.5): open a session and show its captcha, take the
// captcha (the API adds the supplier code and the stored password, INV-81), then the OTP. A wrong captcha or OTP is
// asked again in place with the portal's message (§4.2); any other failure ends the login with its plain message.
import type { RouteOutput } from "@senstosales/schemas";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

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

const closeSession = (sessionId: string): void => {
  // An ended session answers 404; either way it is closed.
  void api.request("bhel.close", { params: { sessionId } }).catch(() => {});
};

/**
 * Each login attempt has a number, and Cancel starts a new one. A request that settles after its attempt was cancelled
 * changes nothing, and a portal session it opened is closed at once, so a cancelled login never comes back or stays
 * open in the background.
 */
export function useBhelLogin() {
  const [login, setLogin] = useState<Login>(IDLE);
  const attempt = useRef(0);
  const current = (token: number): boolean => token === attempt.current;
  const fail = (error: unknown, token: number) => {
    if (current(token)) setLogin({ step: "failed", message: message(error) });
  };

  const start = useMutation({
    mutationFn: (_token: number) => api.request("bhel.start"),
    onMutate: () => setLogin({ step: "connecting" }),
    onSuccess: ({ sessionId, captchaPng }, token) => {
      if (current(token)) setLogin({ step: "captcha", sessionId, captchaPng, message: null });
      else closeSession(sessionId);
    },
    onError: fail,
  });
  /** The captcha or the OTP the user typed, as the session's current step asks. */
  const answer = useMutation({
    mutationFn: ({
      sessionId,
      step,
      code,
    }: {
      sessionId: string;
      step: "captcha" | "otp";
      code: string;
      token: number;
    }) =>
      step === "captcha"
        ? api.request("bhel.captcha", { params: { sessionId }, body: { captcha: code } })
        : api.request("bhel.otp", { params: { sessionId }, body: { otp: code } }),
    onSuccess: (next, { sessionId, token }) => {
      if (current(token)) setLogin(afterStep(sessionId, next));
    },
    onError: (error, { token }) => fail(error, token),
  });

  /** Ends the login: closes its portal session, if one is open, and leaves any request still out to be ignored. */
  function close(): void {
    attempt.current += 1;
    if ("sessionId" in login) closeSession(login.sessionId);
    answer.reset();
    setLogin(IDLE);
  }

  return {
    login,
    submitting: answer.isPending,
    start: () => {
      attempt.current += 1;
      start.mutate(attempt.current);
    },
    /** Sends `code` for the step the login is at; nothing outside the captcha and OTP steps. */
    submit: (code: string) => {
      if (login.step === "captcha" || login.step === "otp") {
        answer.mutate({ sessionId: login.sessionId, step: login.step, code, token: attempt.current });
      }
    },
    close,
  };
}
