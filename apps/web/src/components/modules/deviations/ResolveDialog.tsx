import { useState } from "react";

import { useInvalidate, api } from "../../../lib/api.ts";
import { ConfirmDialog, FormField, Textarea, useToast } from "../../common/index.ts";
import type { FlagRow } from "./issue.ts";

export interface ResolveDialogProps {
  /** The flag to resolve; the dialog is closed while null. */
  readonly flag: FlagRow | null;
  onClose(): void;
}

/**
 * Resolve (acknowledge) one flag with an optional note (SPEC-17 §2, INV-59): the flag is marked resolved and nothing
 * else changes. The list is read again afterwards; a failure keeps the dialog open with the server's message.
 */
export function ResolveDialog({ flag, onClose }: Readonly<ResolveDialogProps>) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (): void => {
    setNote("");
    setError(null);
    onClose();
  };

  async function resolve(target: FlagRow) {
    setBusy(true);
    setError(null);
    try {
      await api.request("flags.acknowledge", { params: { id: target.id }, body: { note: note.trim() || null } });
      toast("Deviation resolved", `The flag on PO ${target.poNumber} is marked resolved.`, "success");
      close();
      await invalidate("flags", "dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={flag !== null}
      onClose={close}
      onConfirm={() => flag && void resolve(flag)}
      title="Resolve deviation?"
      variant="info"
      confirmLabel="Resolve"
      loading={busy}
      message={
        <FormField label="Note (optional)" error={error ?? undefined} className="text-left">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </FormField>
      }
    />
  );
}
