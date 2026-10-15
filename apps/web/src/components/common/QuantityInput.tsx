import { fmtQtyInput, parseQtyInput } from "@senstosales/schemas/formatters";
import { type ComponentProps, useState } from "react";

import { cn } from "../../lib/cn.ts";
import { Input } from "../ui/input.tsx";

/** Milli-units (C3). */
type Qty = Parameters<typeof fmtQtyInput>[0];

export interface QuantityInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  readonly value: Qty;
  onChange(value: Qty): void;
}

const shown = (q: Qty): string => (q === 0 ? "" : fmtQtyInput(q));

/**
 * The legacy numeric quantity field: empty while the value is 0, the text selected on focus so typing replaces it,
 * and only quantities reach `onChange` (empty or negative is 0). There is no upper limit (C6): over-dispatch is
 * flagged after creation, never blocked here.
 */
export function QuantityInput({
  value,
  onChange,
  onBlur,
  className,
  placeholder = "0",
  ...props
}: Readonly<QuantityInputProps>) {
  const [text, setText] = useState(() => shown(value));
  const [seen, setSeen] = useState(value);
  // A new value from outside (a reset, a server answer) replaces the text, unless the text already reads as it.
  if (value !== seen) {
    setSeen(value);
    if (parseQtyInput(text) !== value) setText(shown(value));
  }
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={(e) => e.currentTarget.select()}
      // Leaving the field shows the quantity it holds (`-5` held as 0 reads empty).
      onBlur={(e) => {
        setText(shown(value));
        onBlur?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseQtyInput(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      className={cn("text-center tabular-nums", className)}
    />
  );
}
