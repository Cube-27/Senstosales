import { AlertCircle } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";

/** A form's error line: always there and invisible until there is a message, so it moves nothing (C8). */
export function FormAlert({ message }: { readonly message: string | null }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-md border border-error/20 bg-error/10 px-3 role-body-text text-error",
        !message && "invisible",
      )}
    >
      <AlertCircle className="size-4" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/**
 * A create page's error line, in its header beside Save: a fixed slot, invisible until there is a message, so the
 * form keeps no blank band for it and nothing moves when it shows (C8, UI-MISC). A long message is cut to one line
 * with the whole of it in the title.
 */
export function HeaderAlert({ message }: { readonly message: string | null }) {
  return (
    <div
      role="alert"
      title={message ?? undefined}
      className={cn(
        "flex h-8 w-96 shrink-0 items-center gap-2 rounded-md border border-error/20 bg-error/10 px-3 role-body-text-sm text-error",
        !message && "invisible",
      )}
    >
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{message}</span>
    </div>
  );
}
