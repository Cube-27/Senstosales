// `parseSrv` (SPEC-06 §4.1): one SRV file holds every SRV of one PO. Rows are grouped by SRV number; an item key
// `(po_item_no, lot_no, srv_item_no)` seen twice in one SRV fails the whole file (A2-10, INV-50).
import { loadPage } from "../html.ts";
import type { ParseResult, SrvDocument } from "../types.ts";
import { columnLabel, isDataRow, readRow, srvTables } from "./table.ts";
import type { SrvTable } from "./table.ts";

type Group = { srv: SrvDocument; keys: Set<string> };

export function parseSrv(html: string): ParseResult<SrvDocument[]> {
  const groups = new Map<string, Group>();
  for (const table of srvTables(loadPage(html))) {
    const added = addRows(table, groups);
    if (!added.ok) return added;
  }
  const srvs = [...groups.values()].map((group) => group.srv);
  return srvs.length > 0
    ? { ok: true, value: srvs }
    : { ok: false, error: { code: "no-srv-table", message: "The page has no SRV table with rows" } };
}

function addRows(table: SrvTable, groups: Map<string, Group>): ParseResult<void> {
  for (const [index, row] of table.rows.entries()) {
    if (!isDataRow(table, row)) continue;
    const rowNo = index + 2;
    const read = readRow(table, row, rowNo);
    if (!read.ok) return read;
    const { item, ...ids } = read.value;
    const first = groups.values().next().value?.srv;
    if (first && first.poNumber !== ids.poNumber) {
      const message = `The file mixes PO ${first.poNumber} and PO ${ids.poNumber}`;
      return {
        ok: false,
        error: {
          code: "mixed-po-numbers",
          message,
          location: `row ${rowNo}, ${columnLabel(table, "poNumber")}`,
        },
      };
    }
    const group = groups.get(ids.srvNumber) ?? newGroup(table, row, ids);
    groups.set(ids.srvNumber, group);
    const key = `${item.poItemNo}/${item.lotNo}/${item.srvItemNo}`;
    if (group.keys.has(key)) {
      const message = `SRV ${ids.srvNumber} has item ${item.poItemNo}, lot ${item.lotNo}, SRV item ${item.srvItemNo} more than once`;
      return { ok: false, error: { code: "duplicate-srv-item-key", message, location: `row ${rowNo}` } };
    }
    group.keys.add(key);
    group.srv.items.push(item);
  }
  return { ok: true, value: undefined };
}

/** An SRV's date and raw header are its first row's. */
const newGroup = (table: SrvTable, row: string[], ids: Omit<SrvDocument, "rawHeader" | "items">): Group => ({
  srv: { ...ids, rawHeader: Object.fromEntries(table.header.map((label, i) => [label, row[i] ?? ""])), items: [] },
  keys: new Set(),
});
