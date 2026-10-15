import { fmtCount } from "@senstosales/schemas/formatters";
import { PAGE_SIZES } from "@senstosales/schemas/paging";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";

export interface PaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  onPage(page: number): void;
  onPageSize(size: number): void;
  readonly className?: string;
}

interface NavProps {
  readonly label: string;
  readonly icon: typeof ChevronFirst;
  readonly disabled: boolean;
  onClick(): void;
}

function Nav({ label, icon: Icon, disabled, onClick }: NavProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-6 text-tertiary hover:text-foreground"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden />
    </Button>
  );
}

/**
 * The legacy pager: the row range, the page-size select and first/previous/next/last around "page / pages". The
 * range and page text sit in fixed-width `tabular-nums` slots, so no page moves a control (C8, INV-70).
 */
export function Pagination({ page, pageSize, total, onPage, onPageSize, className }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex h-9 shrink-0 items-center justify-between bg-surface-sunken/30 px-3", className)}
    >
      <p className="w-44 truncate role-pagination-text tabular-nums" aria-live="polite">
        <span className="role-pagination-number">
          {fmtCount(first)}-{fmtCount(last)}
        </span>
        <span className="mx-1">of</span>
        <span className="role-pagination-number">{fmtCount(total)}</span>
      </p>
      <div className="flex items-center gap-3">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger aria-label="Rows per page" className="h-7 w-16 rounded-lg px-2 role-body-text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Nav label="First page" icon={ChevronFirst} disabled={page <= 1} onClick={() => onPage(1)} />
          <Nav label="Previous page" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} />
          <p className="w-20 text-center role-pagination-text tabular-nums">
            <span className="role-pagination-number">{page}</span>
            <span className="mx-1">/</span>
            <span className="role-pagination-number">{pages}</span>
          </p>
          <Nav label="Next page" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} />
          <Nav label="Last page" icon={ChevronLast} disabled={page >= pages} onClick={() => onPage(pages)} />
        </div>
      </div>
    </nav>
  );
}
