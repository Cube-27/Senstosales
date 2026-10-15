// shadcn/ui Textarea (MIT, see NOTICE), restyled to the globals.css tokens as the legacy textarea looked.
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn.ts";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-surface-sunken/40 px-3 py-2 role-body-text placeholder:text-placeholder hover:border-border-strong hover:bg-surface-sunken/70 focus:border-primary disabled:cursor-not-allowed disabled:opacity-65 aria-invalid:border-error",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
