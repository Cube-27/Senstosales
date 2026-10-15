import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ArrowLeft } from "../../lib/icons.ts";

export interface PageHeaderProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly action?: ReactNode;
  /** A back button that runs this; takes precedence over `backTo`. */
  readonly onBack?: () => void;
  /** A back link to this route. */
  readonly backTo?: LinkProps["to"];
}

const BACK =
  "flex size-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-sunken hover:text-primary";

/** A page's title row: optional back control, title and subtitle, and the page actions on the right. */
export function PageHeader({ title, subtitle, action, onBack, backTo }: PageHeaderProps) {
  let back: ReactNode = null;
  if (onBack) {
    back = (
      <button type="button" onClick={onBack} aria-label="Go back" className={BACK}>
        <ArrowLeft className="size-4" />
      </button>
    );
  } else if (backTo) {
    back = (
      <Link to={backTo} aria-label="Go back" className={BACK}>
        <ArrowLeft className="size-4" />
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="flex min-w-0 items-start gap-3">
        {back}
        <div className="relative min-w-0">
          <h1 className="role-page-title">{title}</h1>
          {subtitle && <div className="mt-1 role-page-subtitle">{subtitle}</div>}
        </div>
      </div>
      {action && <div className="flex min-w-0 items-center gap-3">{action}</div>}
    </div>
  );
}
