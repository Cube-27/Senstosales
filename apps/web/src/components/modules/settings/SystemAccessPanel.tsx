// The legacy Access Control panel (INV-80): the default-password notice, change password and reset to defaults (the
// confirmation phrase only, owner answer 19), each with its own button, plus the BHEL portal password, shown only as saved or not (INV-81). Change password and reset
// end every session, so both return to the login. No length or complexity rule (C11).
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import { showServerErrors } from "../../../lib/form-errors.ts";
import { AlertCircle, ShieldCheck } from "../../../lib/icons.ts";
import { LOGIN, sessionQuery } from "../../../lib/session.ts";
import { Button, FormField, Input, useToast } from "../../common/index.ts";
import { DEFAULT_CREDENTIALS, RESET_PHRASE, USERNAME, useChangePassword, useResetDefaults } from "../auth/useAuth.ts";
import { BhelPasswordField } from "./BhelPasswordField.tsx";
import { FormRootError, TextField } from "./ProfileFields.tsx";

const zChangePassword = z
  .object({
    currentPassword: z.string().min(1, "Enter the current password."),
    newPassword: z.string().min(1, "Enter a new password."),
    confirmPassword: z.string(),
  })
  .refine((b) => b.newPassword === b.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two new passwords do not match.",
  });

const CARD = "rounded-lg border border-border/70 bg-surface-sunken/40 p-4";

export function SystemAccessPanel() {
  const { data: session } = useQuery(sessionQuery);
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-accent" />
        <h2 className="role-section-title">Access Control</h2>
      </div>
      {session?.isDefaultPassword && <DefaultPasswordNotice />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChangePasswordForm />
        <ResetDefaultsForm />
      </div>
      <BhelPasswordField />
    </div>
  );
}

/** The legacy notice while the default password is in use; it never forces a change (C11). */
function DefaultPasswordNotice() {
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-warning"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="role-helper-text">
        Default credentials <strong>{DEFAULT_CREDENTIALS}</strong> are still active. Change the password when
        convenient.
      </span>
    </div>
  );
}

/** After a password change or reset every session has ended: go to the login. */
function useBackToLogin() {
  const navigate = useNavigate();
  return () => navigate({ to: LOGIN, replace: true });
}

function ChangePasswordForm() {
  const change = useChangePassword();
  const toLogin = useBackToLogin();
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(zChangePassword),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const submit = form.handleSubmit(async (body) => {
    try {
      await change.mutateAsync(body);
    } catch (error) {
      showServerErrors(form.setError, error, {
        currentPassword: "currentPassword",
        confirmPassword: "confirmPassword",
      });
      return;
    }
    toast("Password Updated", "Please log in again with the new password.", "success");
    await toLogin();
  });
  return (
    <FormProvider {...form}>
      <form className={CARD} onSubmit={(e) => void submit(e)} noValidate>
        <FormField label="Username">
          <Input value={USERNAME} disabled readOnly />
        </FormField>
        <TextField name="currentPassword" label="Current Password" type="password" />
        <TextField name="newPassword" label="New Password" type="password" />
        <TextField name="confirmPassword" label="Confirm New Password" type="password" />
        <FormRootError />
        <Button type="submit" className="mt-1 w-full" loading={form.formState.isSubmitting}>
          Change Password
        </Button>
      </form>
    </FormProvider>
  );
}

function ResetDefaultsForm() {
  const reset = useResetDefaults();
  const toLogin = useBackToLogin();
  const { toast } = useToast();
  const form = useForm({ defaultValues: { confirmation: "" } });
  const submit = form.handleSubmit(async (body) => {
    try {
      await reset.mutateAsync(body);
    } catch (error) {
      showServerErrors(form.setError, error, { confirmation: "confirmation" });
      return;
    }
    toast("Credentials Reset", `System defaults restored to ${DEFAULT_CREDENTIALS}.`, "success");
    await toLogin();
  });
  return (
    <FormProvider {...form}>
      <form className={CARD} onSubmit={(e) => void submit(e)} noValidate>
        <p className="role-field-label">Reset Credentials to Defaults</p>
        <p className="mb-3 role-helper-text">
          Restores the fixed single-user credentials to <strong>{DEFAULT_CREDENTIALS}</strong>. Requires the
          confirmation phrase <strong>{RESET_PHRASE}</strong>.
        </p>
        <TextField name="confirmation" label="Confirmation Phrase" placeholder={RESET_PHRASE} />
        <FormRootError />
        <Button type="submit" variant="outline" className="mt-1 w-full" loading={form.formState.isSubmitting}>
          Reset to Defaults
        </Button>
      </form>
    </FormProvider>
  );
}
