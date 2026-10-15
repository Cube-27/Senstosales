import type { FormEvent, ReactNode } from "react";

import { Save } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog.tsx";
import { FormAlert } from "./FormAlert.tsx";

export interface FormDialogProps {
  readonly open: boolean;
  onClose(): void;
  readonly title: string;
  readonly description?: string;
  /** The refused save's message; its slot is always there, so it moves nothing (C8). */
  readonly error: string | null;
  /** While saving: both buttons disabled and the dialog cannot be closed. */
  readonly saving: boolean;
  onSave(): void;
  readonly className?: string;
  readonly children: ReactNode;
}

/** A dialog that edits fields over the page (a document's header): the fields, an error line, Cancel and Save. */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  error,
  saving,
  onSave,
  className,
  children,
}: FormDialogProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className={cn("max-w-[var(--modal-width-xl)]", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {children}
          <FormAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              <Save aria-hidden />
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
