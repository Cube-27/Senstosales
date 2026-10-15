import type { ReactNode } from "react";

import { cn } from "../../lib/cn.ts";

export interface LineColumn {
  readonly label: string;
  /** A width class (`w-24`); one column without it takes the rest. */
  readonly width?: string;
  readonly align: "left" | "center" | "right";
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

export interface LineTableProps {
  readonly columns: readonly LineColumn[];
  /** Shown in one row in place of the lines; `null` when there are lines. */
  readonly empty: string | null;
  /** The lines: `<tr>`s of `LineCell`s. */
  readonly children?: ReactNode;
}

/**
 * A create form's line table: fixed layout with the given widths (C8), so typing into a line never resizes a column.
 * It grows only by its own rows.
 */
export function LineTable({ columns, empty, children }: LineTableProps) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        {columns.map((c) => (
          <col key={c.label} className={c.width} />
        ))}
      </colgroup>
      <thead className="bg-surface-sunken/50">
        <tr className="border-b border-border">
          {columns.map((c) => (
            <th key={c.label} scope="col" className={cn("px-3 py-2 role-table-header", ALIGN[c.align])}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empty === null ? (
          children
        ) : (
          <tr>
            <td colSpan={columns.length} className="py-8 text-center role-body-text">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** One cell of a line table. */
export function LineCell({
  align = "left",
  title,
  children,
}: {
  readonly align?: LineColumn["align"];
  readonly title?: string;
  readonly children?: ReactNode;
}) {
  return (
    <td title={title} className={cn("px-3 py-2", ALIGN[align], align === "right" && "tabular-nums")}>
      {children}
    </td>
  );
}
