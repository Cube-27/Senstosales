import { type ColumnDef, flexRender, type RowData, tableFeatures, useTable } from "@tanstack/react-table";
import { type ReactNode, useMemo } from "react";

import { PAGE_SIZES } from "@senstosales/schemas/paging";

import { ArrowDown, ArrowUp, Loading, Sortable } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Checkbox } from "../ui/checkbox.tsx";
import { Pagination } from "./Pagination.tsx";

/**
 * One column (SPEC-14 §4.2). `width` is required: the table never sizes a column by its content (C8, INV-70). It is
 * pixels, a percentage, or `auto` for the one free-text column that takes the width the others leave.
 */
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
  /** A click anywhere on a row (a control in the row handles its own click). */
  readonly onRowClick?: (row: Row) => void;
  /**
   * Selectable rows (the legacy report tabs): a checkbox column first, a header box for the page's rows, and a click
   * on a row toggles it unless `onRowClick` is given.
   */
  readonly selection?: Selection<Row>;
}

export interface Selection<Row> {
  readonly rowKey: (row: Row) => string;
  readonly selected: ReadonlySet<string>;
  onChange(selected: ReadonlySet<string>): void;
}

const SELECT_WIDTH = 40;

/** The least width of a percentage column. */
const SHARE_FLOOR = 160;
/** The least width of the `auto` column. */
const AUTO_FLOOR = 48;

/**
 * The table's least width: its pixel columns at their widths, each percentage column at `SHARE_FLOOR` and the `auto`
 * column at `AUTO_FLOOR`. A narrower window scrolls the table sideways instead of squeezing a column.
 */
const minWidth = (columns: readonly Pick<Column<never>, "width">[], selectable: boolean): number =>
  columns.reduce((sum, { width }) => sum + leastWidth(width), selectable ? SELECT_WIDTH : 0);

function leastWidth(width: string): number {
  if (width === "auto") return AUTO_FLOOR;
  return width.endsWith("%") ? SHARE_FLOOR : Number.parseFloat(width);
}

/** The selection with `key` toggled. */
function toggled(selected: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (!next.delete(key)) next.add(key);
  return next;
}

interface ListQuery {
  readonly data?: { readonly total: number } | undefined;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly error: Error | null;
}

function queryState(q: ListQuery): DataTableProps<unknown>["state"] {
  if (q.isError) return "error";
  return q.isFetching ? "loading" : "ready";
}

/** A list query's total, state and error as the table takes them. */
export const tableQuery = (q: ListQuery) => ({
  total: q.data?.total ?? 0,
  state: queryState(q),
  error: q.error?.message,
});

/** Every body row is this tall. */
const ROW_HEIGHT = 40;
/** The body always shows this many rows, the smallest page; a larger page scrolls inside it under a sticky header,
 * so a page-size change moves nothing around the table (C8). */
const VISIBLE_ROWS = PAGE_SIZES[0];
/** The header row, `h-9`. */
const HEADER_HEIGHT = 36;
const FEATURES = tableFeatures({});

/** A cell's own value as text: `row[key]`, with "—" for no value. */
function plainValue(row: unknown, key: string): string {
  const value: unknown = typeof row === "object" && row !== null ? Reflect.get(row, key) : undefined;
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
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

const SORT_ICON = { ascending: ArrowUp, descending: ArrowDown, none: Sortable };

function Header({ column, sort, onSort }: Readonly<HeaderProps>) {
  const sorted = ariaSort(column.key, column.sortable ?? false, sort);
  const Icon = SORT_ICON[sorted ?? "none"];
  return (
    <th
      scope="col"
      aria-sort={sorted}
      className={cn(
        "relative h-9 overflow-hidden px-3 whitespace-nowrap role-table-header",
        column.align === "right" && "text-right",
      )}
    >
      {column.sortable ? (
        <button
          type="button"
          onClick={() => onSort(column.key)}
          // A button does not inherit the uppercase of the header on its own.
          className="relative inline-block max-w-full align-middle [text-transform:inherit] hover:text-foreground"
        >
          <span className="block truncate">{column.header}</span>
          {/* Beside the text, in the cell's padding when the text fills the column, so the arrow never takes the
              header's own width (UI-HDR). */}
          <Icon
            className={cn(
              "absolute top-1/2 size-3 -translate-y-1/2",
              column.align === "right" ? "right-full mr-0.5" : "left-full ml-0.5",
              sorted === "none" ? "text-tertiary opacity-50" : "text-accent",
            )}
            aria-hidden
          />
        </button>
      ) : (
        <span className="block truncate">{column.header}</span>
      )}
    </th>
  );
}

/** The header box: checked when every row of the page is selected, mixed when some are. */
function SelectAll<Row>({ selection, rows }: { readonly selection: Selection<Row>; readonly rows: readonly Row[] }) {
  const keys = rows.map(selection.rowKey);
  const count = keys.filter((key) => selection.selected.has(key)).length;
  const all = count > 0 && count === keys.length;
  const toggle = (): void => {
    const next = new Set(selection.selected);
    for (const key of keys) {
      if (all) next.delete(key);
      else next.add(key);
    }
    selection.onChange(next);
  };
  return (
    <th scope="col" className="h-9 px-3">
      <Checkbox
        aria-label="Select all rows on this page"
        checked={all || (count > 0 && "indeterminate")}
        disabled={keys.length === 0}
        onCheckedChange={toggle}
        className="size-4 align-middle"
      />
    </th>
  );
}

function SelectRow<Row>({
  selection,
  row,
  n,
}: {
  readonly selection: Selection<Row>;
  readonly row: Row;
  readonly n: number;
}) {
  const key = selection.rowKey(row);
  return (
    // The row's own click would toggle it a second time.
    <td className="px-3" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        aria-label={`Select row ${n}`}
        checked={selection.selected.has(key)}
        onCheckedChange={() => selection.onChange(toggled(selection.selected, key))}
        className="size-4 align-middle"
      />
    </td>
  );
}

/** Loading, empty or error: one cell filling the reserved body, so the footprint never changes (INV-71). */
type BodyStateProps = Pick<DataTableProps<never>, "state" | "error" | "emptyText"> & {
  readonly colSpan: number;
};

function BodyState({ state, error, emptyText, colSpan }: Readonly<BodyStateProps>) {
  let content = <span className="role-empty-text">{emptyText}</span>;
  if (state === "loading") {
    content = (
      <span role="status" className="inline-flex items-center gap-2 role-empty-text">
        <Loading className="size-4 animate-spin" aria-hidden />
        Loading...
      </span>
    );
  } else if (state === "error") {
    content = (
      <span role="alert" className="role-empty-text text-error">
        {error ?? "Something went wrong"}
      </span>
    );
  }
  return (
    // Every body row has the same 1px bottom border, so the collapsed table is the same height in every state.
    <tr className="border-b border-transparent">
      <td colSpan={colSpan} className="text-center align-middle" style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}>
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
export function DataTable<Row extends RowData>(props: Readonly<DataTableProps<Row>>) {
  const { columns, rows, pageSize, state, rowHighlight, onRowClick, selection } = props;
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
  const colSpan = columns.length + (selection ? 1 : 0);
  const rowClick =
    onRowClick ?? (selection && ((row: Row) => selection.onChange(toggled(selection.selected, selection.rowKey(row)))));

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        {/* The gutter is always reserved, so a scrollbar appearing never narrows the columns. */}
        <div
          role="region"
          aria-label="Table rows"
          // Focusable, so the rows of a larger page can be scrolled from the keyboard.
          tabIndex={0}
          // As wide as the table plus the gutter, and at least the container, so only the outer box scrolls sideways.
          className="w-fit min-w-full overflow-y-auto [scrollbar-gutter:stable]"
          style={{ height: HEADER_HEIGHT + VISIBLE_ROWS * ROW_HEIGHT }}
        >
          <table
            className="w-full table-fixed border-collapse text-left"
            style={{ minWidth: minWidth(columns, selection !== undefined) }}
            aria-busy={state === "loading"}
          >
            <colgroup>
              {selection && <col style={{ width: SELECT_WIDTH }} />}
              {columns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-sunken">
              <tr className="border-b border-border">
                {/* Only the rows on screen: an error hides the cached ones. */}
                {selection && <SelectAll selection={selection} rows={showRows ? data : []} />}
                {columns.map((column) => (
                  <Header key={column.key} column={column} sort={props.sort} onSort={props.onSort} />
                ))}
              </tr>
            </thead>
            <tbody className={cn(state === "loading" && showRows && "opacity-80")}>
              {showRows ? (
                <>
                  {bodyRows.map((row, n) => (
                    <tr
                      key={row.id}
                      style={{ height: ROW_HEIGHT }}
                      data-highlighted={rowHighlight?.(row.original) || undefined}
                      onClick={
                        rowClick &&
                        ((e) => {
                          // A link in the row opens its document (a modifier-click a new tab) without the row's click.
                          if (e.target instanceof Element && e.target.closest("a")) return;
                          rowClick(row.original);
                        })
                      }
                      className={cn(
                        "border-b border-border/50 hover:bg-surface-sunken/65 data-[highlighted]:bg-warning/[0.04] data-[highlighted]:shadow-[inset_2px_0_0_var(--warning)]",
                        rowClick && "cursor-pointer",
                      )}
                    >
                      {selection && <SelectRow selection={selection} row={row.original} n={n + 1} />}
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
                  {Array.from({ length: Math.max(0, VISIBLE_ROWS - bodyRows.length) }, (_, i) => (
                    <tr
                      key={`filler-${i}`}
                      aria-hidden
                      style={{ height: ROW_HEIGHT }}
                      className="border-b border-transparent"
                    >
                      <td colSpan={colSpan} />
                    </tr>
                  ))}
                </>
              ) : (
                <BodyState state={state} error={props.error} emptyText={props.emptyText} colSpan={colSpan} />
              )}
            </tbody>
          </table>
        </div>
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
