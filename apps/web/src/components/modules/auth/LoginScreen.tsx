// The login page (SPEC-15 PR 1): the legacy "Local Access" card. The username is fixed (INV-80), "remember me" is
// on by default as legacy, errors show as plain text in place (C8), and a successful login returns to the page the
// user asked for. The card sits at a fixed top offset so opening the reset panel only grows it downward (C8).
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { serverErrors } from "../../../lib/form-errors.ts";
import { AlertCircle, CheckCircle, ShieldCheck } from "../../../lib/icons.ts";
import { safeReturn } from "../../../lib/session.ts";
import { Button, Checkbox, FormField, Input, Label, useToast } from "../../common/index.ts";
import { DEFAULT_CREDENTIALS, RESET_PHRASE, USERNAME, useLogin, useResetDefaults } from "./useAuth.ts";

export function LoginScreen() {
  const [restored, setRestored] = useState(false);
  return (
    <div data-auth-screen="true" className="flex min-h-screen justify-center px-4 pt-[12vh] pb-10">
      <div className="h-fit w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-7 flex items-center gap-4">
          <div className="rounded-lg bg-primary/10 p-3 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h1 className="role-page-title">Local Access</h1>
            <p className="role-page-subtitle">Sign in on this machine to continue working.</p>
          </div>
        </div>

        {restored && (
          <div role="status" className="mb-4 rounded-lg border border-success/20 bg-success/10 p-3 text-success">
            <span className="role-body-text">
              Credentials restored to <strong>{DEFAULT_CREDENTIALS}</strong>.
            </span>
          </div>
        )}

        <LoginForm />
        <ResetPanel onRestored={() => setRestored(true)} />

        <div className="mt-6 flex items-center gap-2 text-tertiary">
          <CheckCircle className="size-4" />
          <span className="role-helper-text">
            Local sessions stay signed in until logout, password change, or reset.
          </span>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth/login" });
  const { toast } = useToast();
  const login = useLogin();
  const { register, control, handleSubmit, setError, formState } = useForm({
    defaultValues: { password: "", rememberMe: true },
  });

  const submit = handleSubmit(async (body) => {
    try {
      await login.mutateAsync(body);
    } catch (error) {
      const { fields, message } = serverErrors(error);
      setError("password", { message: fields["password"] ?? message });
      return;
    }
    toast("Signed In", "Local session established.", "success");
    await navigate({ href: safeReturn(redirect), replace: true });
  });

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} noValidate>
      <FormField label="Username">
        <Input name="username" value={USERNAME} readOnly autoComplete="username" spellCheck={false} />
      </FormField>
      <FormField label="Password" error={formState.errors.password?.message}>
        <Input type="password" placeholder="Enter password" autoComplete="current-password" {...register("password")} />
      </FormField>
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="rememberMe"
          render={({ field }) => (
            <Checkbox
              id="remember-me"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <Label htmlFor="remember-me" className="cursor-pointer role-helper-text">
          Keep me signed in on this device
        </Label>
      </div>
      <Button type="submit" loading={formState.isSubmitting} className="mt-1">
        Sign In
      </Button>
    </form>
  );
}

/** "Forgot the password?": the legacy reset to the default credentials with the confirmation phrase (INV-80). */
function ResetPanel({ onRestored }: { readonly onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const reset = useResetDefaults();
  const {
    register,
    handleSubmit,
    setError,
    reset: clear,
    formState,
  } = useForm({
    defaultValues: { confirmation: "" },
  });

  const submit = handleSubmit(async (body) => {
    try {
      await reset.mutateAsync(body);
    } catch (error) {
      const { fields, message } = serverErrors(error);
      setError("confirmation", { message: fields["confirmation"] ?? fields["currentPassword"] ?? message });
      return;
    }
    clear();
    setOpen(false);
    onRestored();
    toast("Credentials Reset", `System defaults restored to ${DEFAULT_CREDENTIALS}.`, "success");
  });

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface-sunken/40 p-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="w-full justify-start px-0 role-field-label hover:bg-transparent"
      >
        Forgot the password? Reset local credentials
      </Button>

      {open && (
        <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => void submit(e)} noValidate>
          <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-warning">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="role-body-text">
              Type the confirmation phrase to restore the system defaults `{DEFAULT_CREDENTIALS}`.
            </span>
          </div>
          <FormField label="Confirmation Phrase" error={formState.errors.confirmation?.message}>
            <Input placeholder={RESET_PHRASE} autoComplete="off" {...register("confirmation")} />
          </FormField>
          <Button type="submit" variant="outline" loading={formState.isSubmitting}>
            Reset to Defaults
          </Button>
        </form>
      )}
    </div>
  );
}
