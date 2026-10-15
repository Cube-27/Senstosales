import { cn } from "../../lib/cn.ts";
import { Badge, type BadgeProps } from "../ui/badge.tsx";

export type Status = "success" | "warning" | "error" | "info" | "neutral" | "pending";

// The legacy status badge: a colour, a default label and a dot per status; `pending` pulses.
const STATUS: Record<Status, { color: NonNullable<BadgeProps["color"]>; label: string; dot: string }> = {
  success: { color: "success", label: "Active", dot: "bg-success" },
  warning: { color: "warning", label: "Pending", dot: "bg-warning" },
  error: { color: "error", label: "Error", dot: "bg-error" },
  info: { color: "info", label: "Info", dot: "bg-info" },
  neutral: { color: "neutral", label: "Inactive", dot: "bg-subtle" },
  pending: { color: "warning", label: "Pending", dot: "animate-pulse bg-warning" },
};

export interface StatusBadgeProps extends Omit<BadgeProps, "color"> {
  readonly status: Status;
  /** The coloured dot before the label; on by default. */
  readonly dot?: boolean;
}

/** A badge for a state; the label defaults to the status's legacy word. */
export function StatusBadge({ status, dot = true, children, ...props }: StatusBadgeProps) {
  const { color, label, dot: dotClass } = STATUS[status];
  return (
    <Badge color={color} {...props}>
      {dot && <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />}
      {children ?? label}
    </Badge>
  );
}
