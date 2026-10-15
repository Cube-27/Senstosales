import { Link, useLocation } from "@tanstack/react-router";

import { cn } from "../../lib/cn.ts";
import { isNavItemActive, NAV_GROUPS } from "./navigation.ts";

function SidebarBrand() {
  return (
    <div className="flex h-[var(--header-height)] items-center border-b border-border px-3">
      <Link
        to="/"
        aria-label="Go to Dashboard"
        className="group flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-sunken"
      >
        <span className="relative size-8 shrink-0 rounded-md bg-primary">
          <svg viewBox="0 0 36 36" className="h-full w-full" fill="none" aria-hidden="true">
            <path d="M8 9h20l-8 10v8l-4-2.2v-5.8L8 9z" className="fill-white" fillOpacity="0.96" />
            <circle cx="27.2" cy="8.8" r="2" className="fill-primary-contrast" />
          </svg>
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-surface bg-success" />
        </span>
        <span className="min-w-0 truncate role-heading-md">SenstoSales</span>
      </Link>
    </div>
  );
}

/** The left navigation: brand, grouped links (the current one marked), and the status footer. */
export function SidebarNav() {
  const { pathname } = useLocation();

  return (
    <aside
      aria-label="Main navigation"
      className="app-shell-sidebar flex h-full w-[var(--sidebar-width)] flex-shrink-0 flex-col border-r border-border bg-sidebar-panel-bg"
    >
      <SidebarBrand />
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="mb-1 px-3">
              <span className="role-section-title">{group.label}</span>
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ name, to, icon: ItemIcon }) => {
                const active = isNavItemActive(pathname, to);
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-8 items-center rounded-sm px-3 role-body-text transition-colors duration-150",
                      active
                        ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                        : "text-foreground/75 hover:bg-surface-sunken hover:text-foreground",
                    )}
                  >
                    {/* Always mounted, so the active rail never shifts the row (C8). */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary",
                        !active && "invisible",
                      )}
                    />
                    <ItemIcon
                      className={cn(
                        "mr-2 size-4 shrink-0 transition-colors duration-150",
                        active ? "text-primary" : "text-foreground/75 group-hover:text-foreground",
                      )}
                    />
                    <span>{name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-2 rounded-sm bg-surface-sunken px-2 py-1.5">
          <span className="size-1.5 rounded-full bg-success" />
          <span className="role-helper-text">System Online</span>
        </div>
      </div>
    </aside>
  );
}
