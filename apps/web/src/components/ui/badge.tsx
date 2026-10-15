// shadcn/ui Badge (MIT, see NOTICE), restyled to the globals.css tokens: the legacy badge's colours (subtle fill,
// coloured text, border) and sizes.
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn.ts";

const badgeVariants = cva("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm border", {
  variants: {
    color: {
      primary: "border-primary/20 bg-primary/10 text-accent",
      success: "border-success/20 bg-success/10 text-success-badge",
      warning: "border-warning/20 bg-warning/10 text-warning-badge",
      error: "border-error/20 bg-error/10 text-error",
      info: "border-info/20 bg-info/10 text-info-badge",
      neutral: "border-border bg-surface-sunken text-muted",
    },
    size: {
      sm: "gap-1 px-1.5 py-0.5 role-metadata",
      md: "gap-1.5 px-2 py-0.5 role-metadata",
    },
  },
  defaultVariants: { color: "neutral", size: "md" },
});

type BadgeProps = Omit<ComponentProps<"span">, "color"> & VariantProps<typeof badgeVariants>;

function Badge({ className, color, size, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ color, size }), className)} {...props} />;
}

export { Badge, type BadgeProps };
