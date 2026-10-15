// Synthetic rows for the streaming writer tests (C1): async sources and a chunk collector.
import type { Column, Row } from "../../src/index.ts";

export type Key = "number" | "note" | "qty";

export const COLUMNS: readonly Column<Key>[] = [
  { key: "number", header: "Doc No", width: 12 },
  { key: "note", header: "Note", width: 30 },
  { key: "qty", header: "Qty", width: 10, numFmt: "0.000" },
];

/** `count` synthetic rows, read lazily; `read` says how many the writer has pulled so far. */
export function source(count: number, fail?: { at: number; error: Error }) {
  const state = { read: 0, closed: false };
  async function* rows(): AsyncGenerator<Row<Key>> {
    try {
      for (let i = 1; i <= count; i++) {
        if (i === fail?.at) throw fail.error;
        state.read = i;
        yield { number: `DOC-${i}`, note: `synthetic note ${i} ${(i * 7919).toString(36)}`, qty: i + 0.5 };
      }
    } finally {
      state.closed = true;
    }
  }
  return { rows: rows(), state };
}

export async function collect<T>(chunks: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const chunk of chunks) all.push(chunk);
  return all;
}

/** Event-loop turns until `read()` stops changing for `quiet` turns in a row. */
export async function settle(read: () => number, quiet = 50): Promise<number> {
  let last = -1;
  for (let still = 0; still < quiet;) {
    await new Promise((resolve) => setImmediate(resolve));
    const now = read();
    still = now === last ? still + 1 : 0;
    last = now;
  }
  return last;
}

/** The given rows as an async source. */
export async function* of(...rows: Row<Key>[]): AsyncGenerator<Row<Key>> {
  yield* rows;
}
