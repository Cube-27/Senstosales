import type { ReactNode } from "react";

export interface InfoFieldProps {
  readonly label: string;
  /** "—" when empty. */
  readonly value: ReactNode;
  /** Spans two grid columns. */
  readonly wide?: boolean | undefined;
}

/** A labelled value in a detail page's field grid. */
export function InfoField({ label, value, wide = false }: InfoFieldProps) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <div className="mb-1 role-field-label">{label}</div>
      <div className="truncate role-field-value">{value === "" || value === null ? "—" : value}</div>
    </div>
  );
}
