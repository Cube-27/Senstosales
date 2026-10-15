import type { RouteOutput } from "@senstosales/schemas";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "../../../lib/cn.ts";

type Preview = RouteOutput<"invoice.previewPo">;

/** One side of the legacy invoice sheet's left column: a titled block with a coloured marker. */
export function PartySection({
  title,
  marker,
  children,
}: {
  readonly title: string;
  readonly marker: "primary" | "secondary";
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 border-b border-border p-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <div className={cn("h-3.5 w-1 rounded-full", marker === "primary" ? "bg-primary" : "bg-secondary")} />
        <span className="role-field-value">{title}</span>
      </div>
      <div className="flex flex-col gap-1 pl-3">{children}</div>
    </div>
  );
}

interface PartyBlockProps {
  readonly title: "Supplier Details" | "Billed To (Buyer)";
  readonly name: string | null;
  readonly address: string | null;
  /** The labelled ids under the address (`GSTIN:`, `TEL:` …). */
  readonly children: readonly (readonly [string, string | null])[];
}

/** The supplier or buyer as the legacy invoice sheet shows them: name, address, then the labelled ids. */
export function PartyBlock({ title, name, address, children }: PartyBlockProps) {
  return (
    <PartySection title={title} marker={title === "Supplier Details" ? "primary" : "secondary"}>
      <div className="role-body-text">{name || "—"}</div>
      <div className="whitespace-pre-wrap role-helper-text">{address || "—"}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {children.map(([label, value]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="role-field-label">{label}</span>
            <span className="role-helper-text">{value || "—"}</span>
          </span>
        ))}
      </div>
    </PartySection>
  );
}

/** The invoice's source: its DC when DC-sourced, else its PO. */
export function SourceLink({ po, dc }: Pick<Preview, "po" | "dc">) {
  return dc ? (
    <Link to="/dc/$id" params={{ id: dc.id }} className="role-reference-link">
      {dc.number}
    </Link>
  ) : (
    <Link to="/po/$id" params={{ id: po.id }} className="role-reference-link">
      {po.poNumber}
    </Link>
  );
}
