import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn.ts";

export type StatColor = "primary" | "success" | "warning" | "error" | "secondary";
type TrendDirection = "up" | "down" | "neutral";

export interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly icon?: ReactNode;
  readonly trend?: { readonly value: string; readonly direction: TrendDirection };
  readonly color?: StatColor;
  /** A card that opens this route… */
  readonly to?: LinkProps["to"];
  /** …or runs this (a filter on the page). */
  readonly onClick?: () => void;
  readonly isActive?: boolean;
}

const COLOURS: Record<StatColor, { icon: string; rail: string; value: string; trend: string; active: string }> = {
  primary: {
    icon: "bg-primary/10 text-primary",
    rail: "bg-primary",
    value: "text-info",
    trend: "text-info",
    active: "bg-primary-subtle",
  },
  success: {
    icon: "bg-success/10 text-success",
    rail: "bg-success",
    value: "text-success",
    trend: "text-success",
    active: "bg-success-subtle",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    rail: "bg-warning",
    value: "text-warning",
    trend: "text-warning",
    active: "bg-warning-subtle",
  },
  error: {
    icon: "bg-error/10 text-error",
    rail: "bg-error",
    value: "text-error",
    trend: "text-error",
    active: "bg-error-subtle",
  },
  secondary: {
    icon: "bg-primary/10 text-primary",
    rail: "bg-border-strong",
    value: "",
    trend: "text-info",
    active: "bg-secondary-subtle",
  },
};

const TREND: Record<TrendDirection, { label: string; arrow: string; colour: string }> = {
  up: { label: "Trending up:", arrow: "↑", colour: "text-success" },
  down: { label: "Trending down:", arrow: "↓", colour: "text-error" },
  neutral: { label: "No change:", arrow: "→", colour: "text-muted" },
};

/** A formatted amount (`₹1,200.00`, `-₹50.00`) shows its rupee sign in the sans face; anything else as is. */
function StatValue({ value }: { readonly value: string | number }) {
  const amount = typeof value === "string" ? /^(-?)₹(.+)$/.exec(value) : null;
  if (!amount) return value;
  return (
    <>
      {amount[1]}
      <span className="role-currency-symbol" aria-hidden="true">
        ₹
      </span>
      <span className="sr-only"> rupees </span>
      {amount[2]}
    </>
  );
}

/** One metric cell of a `StatCardRow`: accent rail, icon, label, value and an optional trend line. */
export function StatCard({
  title,
  value,
  icon,
  trend,
  color = "primary",
  to,
  onClick,
  isActive = false,
}: StatCardProps) {
  const colours = COLOURS[color];
  const clickable = to !== undefined || onClick !== undefined;
  const card = cn(
    "group/stat relative block min-h-[84px] bg-surface text-left transition-[background-color,box-shadow] duration-150",
    clickable && !isActive && "hover:bg-surface-sunken hover:shadow-card-hover",
    isActive && colours.active,
  );
  const content = (
    <div className="relative flex h-full items-center gap-3 overflow-hidden py-3 pr-4 pl-5">
      <div className={cn("absolute inset-y-0 left-0 w-[3px] rounded-r-full", colours.rail)} />
      {icon && (
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm", colours.icon)}>{icon}</div>
      )}
      <div className="min-w-0">
        <p className="truncate role-field-label">{title}</p>
        <p className={cn("mt-0.5 truncate role-kpi-lg", colours.value)}>
          <StatValue value={value} />
        </p>
        {trend && (
          <p className={cn("mt-0.5 truncate role-metadata", colours.trend)}>
            <span className="sr-only">{TREND[trend.direction].label}</span>
            <span className={cn("mr-1 inline-block", TREND[trend.direction].colour)} aria-hidden="true">
              {TREND[trend.direction].arrow}
            </span>
            {trend.value}
          </p>
        )}
      </div>
    </div>
  );

  if (to !== undefined) {
    return (
      <Link to={to} className={card}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(card, "w-full")}>
        {content}
      </button>
    );
  }
  return <div className={card}>{content}</div>;
}

/** The page summary panel: one bordered, divided row of `StatCard`s. */
export function StatCardRow({ children }: { readonly children: ReactNode }) {
  return (
    <section
      aria-label="Page summary"
      className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface shadow-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
    >
      {children}
    </section>
  );
}
