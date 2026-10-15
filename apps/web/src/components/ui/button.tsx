// shadcn/ui Button (MIT, see NOTICE), restyled to the globals.css tokens: the legacy variants and sizes, the global
// `:focus-visible` ring instead of a local one, and `loading` (spinner, disabled) as the legacy button had it.
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { Loading } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border motion-safe:transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-65 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-contrast shadow-sm hover:bg-primary-hover active:bg-primary-active",
        secondary:
          "border-border bg-surface text-foreground shadow-sm hover:border-border-strong hover:bg-surface-sunken active:bg-secondary-subtle",
        outline:
          "border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-sunken active:bg-secondary-subtle",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-surface-sunken active:bg-secondary-subtle",
        destructive: "border-transparent bg-error text-error-contrast shadow-sm hover:opacity-95 active:opacity-90",
      },
      size: {
        default: "h-8 rounded-sm px-3.5 role-body-text",
        sm: "h-8 rounded-sm px-3 role-body-text-sm",
        lg: "h-9 rounded-md px-4 role-body-text",
        icon: "size-8 rounded-sm",
        "icon-sm": "size-6 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child (a link) with the button's look. */
    asChild?: boolean;
    /** Shows a spinner and disables the button while an action runs. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button data-slot="button" className={classes} disabled={disabled || loading} {...props}>
      {loading && <Loading className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export { Button, type ButtonProps, buttonVariants };
