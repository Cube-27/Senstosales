import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/cn.ts";
import { AlertCircle, CheckCircle, type Icon, Info, X } from "../../lib/icons.ts";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastMessage {
  readonly id: number;
  readonly type: ToastType;
  readonly title: string;
  readonly message: string | undefined;
}

export interface ToastApi {
  toast(title: string, message?: string, type?: ToastType): void;
  success(title: string, message?: string): void;
  error(title: string, message?: string): void;
}

/** How long a toast stays before it closes itself (legacy). */
export const TOAST_MS = 4000;

const STYLE: Record<ToastType, { icon: Icon; iconClass: string; rail: string }> = {
  success: { icon: CheckCircle, iconClass: "text-success", rail: "border-l-success" },
  error: { icon: AlertCircle, iconClass: "text-error", rail: "border-l-error" },
  warning: { icon: AlertCircle, iconClass: "text-warning", rail: "border-l-warning" },
  info: { icon: Info, iconClass: "text-info", rail: "border-l-info" },
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within a ToastProvider");
  return api;
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (title: string, message?: string, type: ToastType = "info") => {
      const id = ++nextId.current;
      setToasts((all) => [...all, { id, type, title, message }]);
      timers.current.set(
        id,
        setTimeout(() => remove(id), TOAST_MS),
      );
    },
    [remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: add,
      success: (title, message) => add(title, message, "success"),
      error: (title, message) => add(title, message, "error"),
    }),
    [add],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-6 bottom-6 z-[100] flex flex-col gap-3" aria-live="polite">
        {toasts.map((t) => {
          const { icon: ToastIcon, iconClass, rail } = STYLE[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex max-w-sm min-w-[320px] gap-4 rounded-lg border border-l-4 border-border bg-background px-4 py-4 shadow-lg",
                rail,
              )}
            >
              <ToastIcon className={cn("mt-0.5 size-5 shrink-0", iconClass)} />
              <div className="flex-1">
                <span className="role-heading-sm">{t.title}</span>
                {t.message && <span className="mt-1 block role-metadata">{t.message}</span>}
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Close notification"
                className="shrink-0 self-start text-muted transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
