// `parseSrv` (SPEC-06 §4.1): one SRV file holds every SRV of one PO. Rows are grouped by SRV number and numbered in
// file order within their SRV, so rows whose page keys repeat are all kept (A2-10). A row that cannot be read fails
// its SRV only: the file's other SRVs are still read (A2-10, as legacy).
import { loadPage } from "../html.ts";
import type { ParseResult, SrvDocument, SrvFailure, SrvFile } from "../types.ts";
import { isDataRow, readRow, srvNumberOf, srvTables } from "./table.ts";
import type { SrvTable } from "./table.ts";

type State = { srvs: Map<string, SrvDocument>; failed: Map<string, SrvFailure>; poNumber?: string };

/** At least one SRV read, so a caller can read the file's PO number from the first. */
export function parseSrv(html: string): ParseResult<SrvFile> {
  const state: State = { srvs: new Map(), failed: new Map() };
  for (const table of srvTables(loadPage(html))) addRows(table, state);
  const [first, ...rest] = state.srvs.values();
  const failed = [...state.failed.values()];
  if (first) return { ok: true, value: { srvs: [first, ...rest], failed } };
  return failed[0]
    ? { ok: false, error: failed[0].error }
    : { ok: false, error: { code: "no-srv-table", message: "The page has no SRV table with rows" } };
}

function addRows(table: SrvTable, state: State): void {
  for (const [index, row] of table.rows.entries()) {
    if (!isDataRow(table, row)) continue;
    const srvNumber = srvNumberOf(table, row);
    if (state.failed.has(srvNumber)) continue;
    const read = readRow(table, row, index + 2, state.poNumber);
    if (!read.ok) {
      state.srvs.delete(srvNumber);
      state.failed.set(srvNumber, { srvNumber, error: read.error });
      continue;
    }
    const { item, ...ids } = read.value;
    state.poNumber ??= ids.poNumber;
    let srv = state.srvs.get(srvNumber);
    if (!srv) {
      // An SRV's date and raw header are its first row's.
      srv = { ...ids, rawHeader: item.rawRow, items: [] };
      state.srvs.set(srvNumber, srv);
    }
    srv.items.push({ rowNo: srv.items.length + 1, ...item });
  }
}
