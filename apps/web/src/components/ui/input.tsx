// shadcn/ui Input (MIT, see NOTICE), restyled to the globals.css tokens as the legacy input looked; `aria-invalid`
// (set by FormField on an error) gives the error border.
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn.ts";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-sm border border-border bg-surface px-3 role-body-text placeholder:text-placeholder hover:border-border-strong focus:border-primary disabled:cursor-not-allowed disabled:opacity-65 aria-invalid:border-error",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
