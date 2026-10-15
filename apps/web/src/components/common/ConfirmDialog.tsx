import type { ReactNode } from "react";

import { AlertTriangle, Loading } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog.tsx";

export interface ConfirmDialogProps {
  readonly open: boolean;
  onClose(): void;
  onConfirm(): void;
  readonly title: string;
  readonly subtitle?: string;
  readonly warningText?: string;
  readonly message?: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: "danger" | "warning" | "info";
  /** While the action runs: both buttons disabled, the dialog cannot be closed, the confirm button reads "Wait...". */
  readonly loading?: boolean;
}

const TONE = {
  danger: { icon: "border-error/20 bg-error/10 text-error", button: "destructive" },
  warning: { icon: "border-warning/20 bg-warning/10 text-warning", button: "default" },
  info: { icon: "border-primary/20 bg-primary/10 text-accent", button: "default" },
} as const;

/** The legacy action confirmation modal: an icon, the title, an optional warning or message, Cancel and Confirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  subtitle,
  warningText,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "warning",
  loading = false,
}: ConfirmDialogProps) {
  const tone = TONE[variant];
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="max-w-[var(--modal-width-sm)] gap-0 p-0" showCloseButton={false}>
        <DialogHeader className="items-center pt-6 pb-2 text-center">
          <div className={cn("mb-3 flex size-12 items-center justify-center rounded-xl border", tone.icon)}>
            <AlertTriangle className="size-6" aria-hidden />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={subtitle ? undefined : "sr-only"}>
            {subtitle ?? `Confirmation dialog for ${title}`}
          </DialogDescription>
        </DialogHeader>
        {warningText && <p className="px-6 py-3 text-center role-body-text">{warningText}</p>}
        {message && <div className="px-6 py-3 text-center">{message}</div>}
        <DialogFooter className="flex-row gap-2 px-6 pt-3 pb-6">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone.button} size="sm" className="flex-1" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Loading className="animate-spin" aria-hidden />
                Wait...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
