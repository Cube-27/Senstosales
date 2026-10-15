// The login, change-password and reset writes (SPEC-07 auth). Login stores the session the gate reads; change
// password and reset end every session, this one included (INV-80), so the app forgets what it had loaded.
import type { RouteInput } from "@senstosales/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../../lib/api.ts";
import { sessionQuery } from "../../../lib/session.ts";

/** The legacy confirmation phrase for reset-to-defaults (A-17). */
export const RESET_PHRASE = "RESET TO DEFAULTS";
/** The fixed user and the default password a reset restores (INV-80). */
export const USERNAME = "admin";
export const DEFAULT_CREDENTIALS = "admin/admin";

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteInput<"auth.login">["body"]) => api.request("auth.login", { body }),
    onSuccess: (session) => queryClient.setQueryData(sessionQuery.queryKey, session),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteInput<"auth.changePassword">["body"]) => api.request("auth.changePassword", { body }),
    onSuccess: () => queryClient.clear(),
  });
}

export function useResetDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteInput<"auth.resetDefaults">["body"]) => api.request("auth.resetDefaults", { body }),
    onSuccess: () => queryClient.clear(),
  });
}
