import { AlertCircle } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";

interface AlertProps {
  readonly message: string | null;
}

/** An error line that is always there and invisible until there is a message, so it moves nothing (C8). */
function ErrorLine({ message, compact }: AlertProps & { readonly compact: boolean }) {
  return (
    <div
      role="alert"
      title={compact ? (message ?? undefined) : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md border border-error/20 bg-error/10 px-3 text-error",
        compact ? "h-8 w-96 min-w-0 role-body-text-sm" : "min-h-10 role-body-text",
        !message && "invisible",
      )}
    >
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      <span className={cn(compact && "truncate")}>{message}</span>
    </div>
  );
}

/** A form's error line. */
export const FormAlert = ({ message }: AlertProps) => <ErrorLine message={message} compact={false} />;

/**
 * A create page's error line, in its header beside Save: a fixed slot, so the form keeps no blank band for it (C8,
 * UI-MISC). A long message is cut to one line with the whole of it in the title.
 */
export const HeaderAlert = ({ message }: AlertProps) => <ErrorLine message={message} compact />;
