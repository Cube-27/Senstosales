import type { ReactNode } from "react";

import { GlobalSearch } from "./GlobalSearch.tsx";
import { HeaderActions } from "./HeaderActions.tsx";
import { SidebarNav } from "./SidebarNav.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { ToastProvider } from "./Toast.tsx";

/**
 * The app shell: sidebar, header (search, shortcuts, page actions slot, theme) and the scrolling content area.
 * Screens that set `data-auth-screen="true"` (login) hide the sidebar and header (`globals.css`).
 */
export function AppChrome({ children }: { readonly children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground subpixel-antialiased">
        <SidebarNav />
        <div className="app-shell-root flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="app-shell-header flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-6">
            <div className="w-full max-w-sm">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-2">
              <HeaderActions />
              <div id="header-action-portal" />
              <ThemeToggle />
            </div>
          </header>
          <main className="app-shell-main flex-1 overflow-y-auto bg-background">
            <div className="app-shell-container mx-auto max-w-[var(--container-max)] p-[var(--container-padding)]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
