import { type ColumnDef, flexRender, type RowData, tableFeatures, useTable } from "@tanstack/react-table";
import { type ReactNode, useMemo } from "react";

import { ArrowDown, ArrowUp, Loading, Sortable } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Pagination } from "./Pagination.tsx";

/** One column (SPEC-14 §4.2). `width` is required: the table never sizes a column by its content (C8, INV-70). */
export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly width: string;
  readonly align?: "left" | "right";
  readonly sortable?: boolean;
  /** The cell's content; without it the cell shows `row[key]`. */
  readonly render?: (row: Row) => ReactNode;
  /** The full text of a truncated cell; without it a plain cell's own value. */
  readonly title?: (row: Row) => string;
}

export interface DataTableProps<Row> {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[] | undefined;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: { readonly key: string; readonly dir: "asc" | "desc" } | undefined;
  readonly state: "loading" | "ready" | "error";
  readonly error?: string | undefined;
  readonly emptyText: string;
  onPage(page: number): void;
  onPageSize(size: number): void;
  onSort(key: string): void;
  /** Flagged rows (§12.3): a tinted row with a bar on its left edge. */
  readonly rowHighlight?: (row: Row) => boolean;
}

/** Every body row is this tall, so a page's body is `pageSize × ROW_HEIGHT` whatever it holds. */
const ROW_HEIGHT = 40;
const FEATURES = tableFeatures({});

/** A cell's own value as text: `row[key]`, with "—" for no value. */
function plainValue(row: unknown, key: string): string {
  const value: unknown = typeof row === "object" && row !== null ? Reflect.get(row, key) : undefined;
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" ? value : String(value);
}

type Sort = DataTableProps<unknown>["sort"];

function ariaSort(key: string, sortable: boolean, sort: Sort) {
  if (!sortable) return undefined;
  if (sort?.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

interface HeaderProps {
  readonly column: Pick<Column<never>, "key" | "header" | "align" | "sortable">;
  readonly sort: Sort;
  onSort(key: string): void;
}

function Header({ column, sort, onSort }: HeaderProps) {
  const sorted = ariaSort(column.key, column.sortable ?? false, sort);
  const Icon = sorted === "ascending" ? ArrowUp : sorted === "descending" ? ArrowDown : Sortable;
  return (
    <th
      scope="col"
      aria-sort={sorted}
      className={cn(
        "h-9 overflow-hidden px-3 whitespace-nowrap role-table-header",
        column.align === "right" && "text-right",
      )}
    >
      {column.sortable ? (
        <button
          type="button"
          onClick={() => onSort(column.key)}
          className={cn(
            "inline-flex max-w-full items-center gap-1 hover:text-foreground",
            column.align === "right" && "flex-row-reverse",
          )}
        >
          <span className="truncate">{column.header}</span>
          <Icon
            className={cn("size-3 shrink-0", sorted === "none" ? "text-tertiary opacity-50" : "text-accent")}
            aria-hidden
          />
        </button>
      ) : (
        <span className="block truncate">{column.header}</span>
      )}
    </th>
  );
}

/** Loading, empty or error: one cell filling the reserved body, so the footprint never changes (INV-71). */
type BodyStateProps = Pick<DataTableProps<never>, "state" | "error" | "emptyText" | "pageSize"> & {
  readonly colSpan: number;
};

function BodyState({ state, error, emptyText, pageSize, colSpan }: BodyStateProps) {
  const content =
    state === "loading" ? (
      <span role="status" className="inline-flex items-center gap-2 role-empty-text">
        <Loading className="size-4 animate-spin" aria-hidden />
        Loading...
      </span>
    ) : state === "error" ? (
      <span role="alert" className="role-empty-text text-error">
        {error ?? "Something went wrong"}
      </span>
    ) : (
      <span className="role-empty-text">{emptyText}</span>
    );
  return (
    // Every body row has the same 1px bottom border, so the collapsed table is the same height in every state.
    <tr className="border-b border-transparent">
      <td colSpan={colSpan} className="text-center align-middle" style={{ height: pageSize * ROW_HEIGHT }}>
        {content}
      </td>
    </tr>
  );
}

/**
 * The shared list table (ARCHITECTURE §12.3, C8, INV-70, INV-71) on TanStack Table: fixed layout with each column's
 * own width, single-line cells truncated with a `title`, a body reserved for a full page (short pages padded with
 * `aria-hidden` filler rows), loading/empty/error inside that body with the header and pager mounted, and the pager
 * always there.
 */
export function DataTable<Row extends RowData>(props: DataTableProps<Row>) {
  const { columns, rows, pageSize, state, rowHighlight } = props;
  const defs = useMemo<ColumnDef<typeof FEATURES, Row>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        header: column.header,
        cell: ({ row }) => (column.render ? column.render(row.original) : plainValue(row.original, column.key)),
      })),
    [columns],
  );
  const data = useMemo(() => [...(rows ?? [])], [rows]);
  const table = useTable({ features: FEATURES, columns: defs, data });
  const bodyRows = table.getRowModel().rows;
  // Rows already on screen stay while the next page loads (keepPreviousData); with none, the body says it loads.
  const showRows = state !== "error" && bodyRows.length > 0;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left" aria-busy={state === "loading"}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="bg-surface-sunken">
            <tr className="border-b border-border">
              {columns.map((column) => (
                <Header key={column.key} column={column} sort={props.sort} onSort={props.onSort} />
              ))}
            </tr>
          </thead>
          <tbody className={cn(state === "loading" && showRows && "opacity-80")}>
            {showRows ? (
              <>
                {bodyRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ height: ROW_HEIGHT }}
                    data-highlighted={rowHighlight?.(row.original) || undefined}
                    className="border-b border-border/50 hover:bg-surface-sunken/65 data-[highlighted]:bg-warning/[0.04] data-[highlighted]:shadow-[inset_2px_0_0_var(--warning)]"
                  >
                    {row.getAllCells().map((cell, i) => {
                      const column = columns[i];
                      if (!column) return null;
                      return (
                        <td
                          key={cell.id}
                          title={
                            column.title?.(row.original) ??
                            (column.render ? undefined : plainValue(row.original, column.key))
                          }
                          className={cn(
                            "overflow-hidden px-3 text-ellipsis whitespace-nowrap role-table-cell",
                            column.align === "right" && "text-right",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, pageSize - bodyRows.length) }, (_, i) => (
                  <tr
                    key={`filler-${i}`}
                    aria-hidden
                    style={{ height: ROW_HEIGHT }}
                    className="border-b border-transparent"
                  >
                    <td colSpan={columns.length} />
                  </tr>
                ))}
              </>
            ) : (
              <BodyState
                state={state}
                error={props.error}
                emptyText={props.emptyText}
                pageSize={pageSize}
                colSpan={columns.length}
              />
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={props.page}
        pageSize={pageSize}
        total={props.total}
        onPage={props.onPage}
        onPageSize={props.onPageSize}
        className="border-t border-border"
      />
    </div>
  );
}
