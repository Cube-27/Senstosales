// shadcn/ui Checkbox (MIT, see NOTICE) on Radix, restyled to the globals.css tokens as the legacy checkbox looked.
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { Check } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";

function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-5 shrink-0 rounded-xs border border-border-strong bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-65 aria-invalid:border-error data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-contrast",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center">
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
