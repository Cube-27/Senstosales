// shadcn/ui Select (MIT, see NOTICE) on Radix, restyled to the globals.css tokens as the legacy select looked: a
// popper list under the trigger, the check on the left of the chosen item. Only the parts the app uses.
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { Check, ChevronDown } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-8 w-full items-center justify-between gap-2 rounded-sm border border-border bg-surface px-3 text-left whitespace-nowrap role-body-text hover:border-border-strong hover:bg-surface-sunken/70 disabled:cursor-not-allowed disabled:opacity-65 aria-invalid:border-error data-[placeholder]:text-placeholder",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-tertiary" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position="popper"
        sideOffset={4}
        className={cn(
          "relative z-[100] max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border border-border bg-surface text-foreground shadow-dropdown",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="w-full min-w-(--radix-select-trigger-width) p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center rounded-sm py-2 pr-3 pl-8 outline-none select-none focus:bg-primary-subtle focus:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-65",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
      <span className="role-body-text">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </span>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
