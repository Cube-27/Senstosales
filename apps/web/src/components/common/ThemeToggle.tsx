import { useState } from "react";

import { cn } from "../../lib/cn.ts";
import { Moon, Sun } from "../../lib/icons.ts";
import { applyTheme, storedTheme } from "../../lib/theme.ts";

/** The header's light/dark switch: a sun in light mode, a moon in dark mode. */
export function ThemeToggle() {
  const [theme, setTheme] = useState(storedTheme);
  const isDark = theme === "dark";
  const toggle = (): void => {
    const next = isDark ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={isDark}
      className="relative flex size-10 items-center justify-center rounded-md border border-border bg-surface transition-colors duration-150 hover:bg-surface-sunken active:bg-secondary-subtle"
    >
      <span className="relative flex size-5 items-center justify-center">
        <span
          className={cn(
            "absolute transition-all duration-200 ease-out",
            isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
          )}
        >
          <Sun className="size-5 text-warning" />
        </span>
        <span
          className={cn(
            "absolute transition-all duration-200 ease-out",
            isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0",
          )}
        >
          <Moon className="size-5 text-primary" />
        </span>
      </span>
    </button>
  );
}
