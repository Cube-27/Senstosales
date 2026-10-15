import { cn } from "../../../lib/cn.ts";
import { Button } from "../../common/index.ts";
import { type Chip, type ChipColor, CHIPS } from "./chips.ts";

const TONE: Record<ChipColor, { active: string; inactive: string }> = {
  default: {
    active: "border-border-strong bg-surface-sunken text-foreground",
    inactive: "border-border/60 bg-surface text-muted hover:border-border",
  },
  primary: {
    active: "border-primary bg-primary text-primary-contrast",
    inactive: "border-primary/20 bg-primary/10 text-accent hover:border-primary/40",
  },
  warning: {
    active: "border-warning bg-warning text-primary-contrast",
    inactive: "border-warning/20 bg-warning/10 text-warning hover:border-warning/40",
  },
  error: {
    active: "border-error bg-error text-primary-contrast",
    inactive: "border-error/20 bg-error/10 text-error hover:border-error/40",
  },
  success: {
    active: "border-success bg-success text-primary-contrast",
    inactive: "border-success/20 bg-success/10 text-success hover:border-success/40",
  },
};

export interface SmartFilterChipsProps {
  isActive(chip: Chip): boolean;
  onToggle(chip: Chip): void;
  /** Clear all: kept in its slot (hidden) while no chip is on (INV-71). */
  onClear(): void;
}

/** The tracker's quick filter chips: each a toggle; Clear all clears every filter. */
export function SmartFilterChips({ isActive, onToggle, onClear }: Readonly<SmartFilterChipsProps>) {
  const active = CHIPS.map(isActive);
  return (
    <div className="flex w-full min-w-0 items-center gap-2 border-b border-border px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {CHIPS.map((chip, i) => {
          const on = active[i] ?? false;
          return (
            <Button
              key={chip.id}
              variant="ghost"
              size="sm"
              aria-pressed={on}
              onClick={() => onToggle(chip)}
              className={cn(
                "h-8 shrink-0 rounded-md border px-3 role-body-text-sm",
                TONE[chip.color][on ? "active" : "inactive"],
              )}
            >
              {chip.label}
            </Button>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className={cn("shrink-0 text-tertiary hover:text-foreground", !active.includes(true) && "invisible")}
      >
        Clear all
      </Button>
    </div>
  );
}
