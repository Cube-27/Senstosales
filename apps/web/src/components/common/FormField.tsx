import { Slot } from "radix-ui";
import { type ReactElement, useId } from "react";

import { cn } from "../../lib/cn.ts";
import { Label } from "../ui/label.tsx";

export interface FormFieldProps {
  readonly label: string;
  /** Shown under the control until there is an error. */
  readonly help?: string;
  /** Replaces the help text and marks the control invalid. */
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly className?: string;
  /** The one control (Input, Select trigger, …); it gets the id, `aria-describedby` and `aria-invalid`. */
  readonly children: ReactElement;
}

/**
 * A labelled control (ARCHITECTURE §12.3): the label names the control, and the help or error text describes it. The
 * message line is always there, so an error appearing moves nothing below it (C8).
 */
export function FormField({ label, help, error, required = false, className, children }: FormFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? help;
  return (
    <div className={cn("w-full", className)}>
      <Label htmlFor={id} className="mb-1.5">
        {label}
        {required && (
          <span className="ml-0.5 text-error" aria-hidden>
            *
          </span>
        )}
      </Label>
      <Slot.Root
        id={id}
        aria-describedby={message ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
      >
        {children}
      </Slot.Root>
      <p id={messageId} className={cn("mt-1.5 min-h-4 role-helper-text", error && "text-error")}>
        {message}
      </p>
    </div>
  );
}
