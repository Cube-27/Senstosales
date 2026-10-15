// The stored BHEL portal password (A-17, INV-81): the page shows only whether one is saved, with Change and Clear.
// The value is typed once and sent; it is never shown or read back. The row keeps one height in every state (C8).
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { serverErrors } from "../../../lib/form-errors.ts";
import { Button, Input } from "../../common/index.ts";
import { bhelPasswordQuery, useBhelPassword } from "./useSettings.ts";

/** Whether a password is saved; blank until the answer arrives. */
function savedText(loading: boolean, saved: boolean): string {
  if (loading) return "";
  return saved ? "Saved" : "Not saved";
}

export function BhelPasswordField() {
  const { data } = useQuery(bhelPasswordQuery);
  const { set, clear } = useBhelPassword();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ defaultValues: { password: "" } });

  const close = (): void => {
    form.reset();
    setEditing(false);
  };
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(serverErrors(e).message);
      return false;
    }
  };
  const submit = form.handleSubmit(async ({ password }) => {
    if (password === "") return setError("Enter the BHEL portal password.");
    if (await run(() => set.mutateAsync(password))) close();
  });

  const saved = data?.saved ?? false;
  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-surface-sunken/40 p-4">
      <p id="bhel-password-label" className="role-field-label">
        BHEL Portal Password
      </p>
      {editing ? (
        <form className="mt-1 flex h-9 items-center gap-2" onSubmit={(e) => void submit(e)} noValidate>
          <Input
            type="password"
            autoComplete="new-password"
            aria-labelledby="bhel-password-label"
            className="max-w-xs"
            autoFocus
            {...form.register("password")}
          />
          <Button type="submit" size="sm" loading={set.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="mt-1 flex h-9 items-center gap-2">
          <span className="w-24 role-body-text">{savedText(data === undefined, saved)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!saved}
            loading={clear.isPending}
            onClick={() => void run(() => clear.mutateAsync())}
          >
            Clear
          </Button>
        </div>
      )}
      <p role="alert" className="mt-1 min-h-4 text-error role-helper-text">
        {error}
      </p>
    </div>
  );
}
