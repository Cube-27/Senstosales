import { fmtDate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { apiQuery } from "../../../lib/api.ts";
import { Forward, Loading } from "../../../lib/icons.ts";
import { Popover, PopoverContent, PopoverTrigger } from "../../common/index.ts";

type DocRow = { readonly to: "/dc/$id" | "/invoice/$id" | "/srv/$id"; readonly type: string; readonly id: string };

export interface LinkedDocsPopoverProps {
  readonly poId: string;
  /** The button that opens it; its count comes from the PO's live link counts (INV-73). */
  readonly trigger: ReactNode;
}

/**
 * The PO's linked documents (INV-73): every DC, invoice and SRV on it, read live when the popover opens, each a link
 * to its page. The list scrolls inside a fixed-size panel, so loading or a long list moves nothing (C8).
 */
export function LinkedDocsPopover({ poId, trigger }: LinkedDocsPopoverProps) {
  const [open, setOpen] = useState(false);
  const linked = useQuery({ ...apiQuery("po.linked", { params: { id: poId } }), enabled: open });
  const docs = linked.data;
  const rows = docs
    ? [
        ...docs.dcs.map((d) => ({ ...d, row: { to: "/dc/$id", type: "DC", id: d.id } satisfies DocRow })),
        ...docs.invoices.map((d) => ({
          ...d,
          row: { to: "/invoice/$id", type: "Invoice", id: d.id } satisfies DocRow,
        })),
        ...docs.srvs.map((d) => ({ ...d, row: { to: "/srv/$id", type: "SRV", id: d.id } satisfies DocRow })),
      ]
    : [];

  let body: ReactNode;
  if (linked.isPending) {
    body = (
      <div role="status" className="flex h-full flex-col items-center justify-center gap-2">
        <Loading className="size-6 animate-spin text-accent" aria-hidden />
        <span className="role-metadata">Traceroute in progress...</span>
      </div>
    );
  } else if (linked.isError) {
    body = (
      <p role="alert" className="p-6 text-center role-metadata text-error">
        No documents could be loaded; refresh failed: {linked.error.message}
      </p>
    );
  } else if (rows.length === 0) {
    body = <p className="p-6 text-center role-metadata">No linked documents found</p>;
  } else {
    body = (
      <ul className="divide-y divide-border/20">
        {rows.map(({ row, number, date }) => (
          <li key={`${row.type}-${row.id}`}>
            <Link
              to={row.to}
              params={{ id: row.id }}
              className="group flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-surface-sunken"
            >
              <span className="w-14 shrink-0 role-metadata">{row.type}</span>
              <span className="min-w-0 flex-1 truncate role-reference-link">{number}</span>
              <span className="shrink-0 role-helper-text">{fmtDate(date)}</span>
              <Forward className="size-4 shrink-0 text-tertiary group-hover:text-primary" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 overflow-hidden p-0">
        <div className="border-b border-border/40 bg-surface-sunken p-3">
          <span className="role-metadata">Document Genealogy</span>
        </div>
        <div className="h-64 overflow-y-auto">{body}</div>
      </PopoverContent>
    </Popover>
  );
}
