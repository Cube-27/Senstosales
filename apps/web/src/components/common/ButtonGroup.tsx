// The legacy segmented control: one button per option, the chosen one filled. Used for the dashboard period, the
// settings sections and other one-of-n switches. Every option keeps its size whichever is chosen (C8).
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";

export interface ButtonGroupOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ButtonGroupProps<T extends string> {
  readonly options: readonly ButtonGroupOption<T>[];
  readonly value: T;
  onChange(value: NoInfer<T>): void;
  /** Names the group for screen readers. */
  readonly label: string;
  readonly className?: string;
}

export function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: Readonly<ButtonGroupProps<T>>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex h-9 items-center gap-0.5 rounded-md border border-border bg-surface p-0.5", className)}
    >
      {options.map((option) => {
        const chosen = option.id === value;
        return (
          <Button
            key={option.id}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={chosen}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-sm px-3 role-ui-label",
              chosen
                ? "bg-primary text-primary-contrast hover:bg-primary-hover"
                : "text-muted hover:bg-surface-sunken/60 hover:text-foreground",
            )}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
