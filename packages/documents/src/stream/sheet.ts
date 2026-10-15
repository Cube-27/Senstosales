// What a streaming export writes: columns in order and rows keyed by column (SPEC-13 §4.1). A string is text, from
// users or BHEL pages, and is written as text (INV-94); a number stays numeric with its column's number format
// (INV-68); null is an empty cell.

export type Cell = string | number | null;

export interface Column<K extends string> {
  readonly key: K;
  readonly header: string;
  /** Excel column width in characters; CSV ignores it. */
  readonly width: number;
  /** Excel number format of the column's number cells; CSV ignores it. */
  readonly numFmt?: string;
}

export type Row<K extends string> = Readonly<Record<K, Cell>>;
