import type { ReactNode } from "react";

import { cn } from "../../lib/cn.ts";
import { FileDown, Loading } from "../../lib/icons.ts";
import { Button } from "../ui/button.tsx";

export interface DownloadButtonProps {
  /** An export is running: a spinner in the icon's place, so the button keeps its size (C8). */
  readonly busy: boolean;
  onClick(): void;
  readonly className?: string;
  readonly children: ReactNode;
}

/** The legacy screens' green Excel download button. */
export function DownloadButton({ busy, onClick, className, children }: DownloadButtonProps) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={cn("border-excel bg-excel text-white hover:border-excel-hover hover:bg-excel-hover", className)}
    >
      {busy ? <Loading className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
      {children}
    </Button>
  );
}
