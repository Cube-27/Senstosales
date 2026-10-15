// shadcn/ui Label (MIT, see NOTICE) on Radix, in the legacy field-label role.
import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn.ts";

function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("block select-none role-field-label peer-disabled:opacity-65", className)}
      {...props}
    />
  );
}

export { Label };
