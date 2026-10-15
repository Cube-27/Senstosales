import { cn } from "../../lib/cn.ts";
import type { Icon } from "../../lib/icons.ts";

export interface DetailTab {
  readonly id: string;
  readonly label: string;
  /** A count pill; it keeps its slot when the count is 0 (C8). */
  readonly badge?: number;
  readonly icon?: Icon;
}

export interface DetailTabsProps {
  readonly tabs: readonly DetailTab[];
  readonly activeTab: string;
  onChange(tabId: string): void;
}

/** The tab strip of a detail page. Each tab controls the panel with id `<tab id>-panel`. */
export function DetailTabs({ tabs, activeTab, onChange }: Readonly<DetailTabsProps>) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-border bg-surface px-4 pt-1">
      {tabs.map(({ id, label, badge, icon: TabIcon }) => {
        const selected = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${id}-tab`}
            aria-controls={`${id}-panel`}
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={cn(
              "flex h-12 items-center gap-2 border-b-2 px-3 text-left role-body-text transition-colors",
              selected
                ? "border-b-primary text-foreground"
                : "border-transparent text-tertiary hover:border-b-border hover:text-foreground",
            )}
          >
            {TabIcon && <TabIcon className="size-4 opacity-70" />}
            {label}
            {badge !== undefined && (
              <span
                aria-hidden={badge === 0}
                className={cn(
                  "min-w-[18px] rounded-full bg-primary/10 px-1.5 py-0.5 text-accent",
                  badge === 0 && "invisible",
                )}
              >
                <span className="role-body-text-sm">{badge}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
