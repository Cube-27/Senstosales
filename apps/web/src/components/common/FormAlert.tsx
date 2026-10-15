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
