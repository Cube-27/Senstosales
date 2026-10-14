// PO items and their lots, read from the item table (SPEC-06 §2). The row rules are the legacy parser's: an item row
// starts with a PO ITM number, a row with LOT NO and DELY QTY adds a lot to the item above, and any other row is
// description text for the item a 1-2 digit cell names, else the item above.
import { parsePageDate } from "../dates.ts";
import { fail, readMoney, readQty } from "../fields.ts";
import { mapColumnsByHeader } from "../html.ts";
import type { Page } from "../html.ts";
import type { ParseResult, PoDocument } from "../types.ts";

type PoItem = PoDocument["items"][number];
type PoLot = PoItem["lots"][number];

/** Column -> header text. A header cell names the column when it contains the text (legacy). */
const HEADERS = {
  poItemNo: "PO ITM",
  materialCode: "MATERIAL CODE",
  unit: "UNIT",
  rate: "PO RATE",
  ordQty: "ORD QTY",
  rcdQty: "RCD QTY",
  rejQty: "REJ QTY",
  lotNo: "LOT NO",
  delyQty: "DELY QTY",
  delyDate: "DELY DATE",
  entryAllow: "ENTRY ALLOW DATE",
  destCode: "DEST CODE",
} as const;
type Column = keyof typeof HEADERS;

const PATTERNS = Object.fromEntries(
  Object.entries(HEADERS).map(([column, header]) => [column, new RegExp(header, "i")]),
) as Record<Column, RegExp>;
const REQUIRED: readonly Column[] = ["poItemNo", "materialCode", "unit", "rate", "ordQty", "rcdQty"];

/** The legacy description pattern for a drawing number; a match shorter than 5 characters is not one. */
const DRAWING = /(?:DRG|DRAWING)[ .-]*(?:NO[.-]*)?[:-]?\s*([A-Z0-9][A-Z0-9./-]*)(?=\s|ITEM|VAR|REV|,|$)/gi;
const WHOLE = /^\d+$/;

/** One table row, read by column; a column the table lacks reads as "". */
type Cells = (column: Column) => string;

export function parsePoItems(page: Page): ParseResult<PoItem[]> {
  const rows = itemTable(page);
  if (!rows) return fail("no-item-table", "The page has no item table (no MATERIAL CODE header row)");
  const columns = mapColumnsByHeader(rows[0] ?? [], PATTERNS);
  const missing = REQUIRED.find((column) => columns[column] === undefined);
  if (missing) return fail("missing-field", `The item table has no ${HEADERS[missing]} column`, HEADERS[missing]);

  const hasRej = columns.rejQty !== undefined;
  const items: PoItem[] = [];
  let current: PoItem | undefined;
  for (const row of rows.slice(1)) {
    const cells: Cells = (column) => {
      const index = columns[column];
      return index === undefined ? "" : (row[index] ?? "");
    };
    if (WHOLE.test(cells("poItemNo"))) {
      const item = readItemRow(cells, items, hasRej);
      if (!item.ok) return item;
      current = item.value;
    } else if (current) {
      const next = readFollowingRow(row, cells, items, current);
      if (!next.ok) return next;
      current = next.value;
    }
  }
  if (items.length === 0) return fail("no-item-table", "The item table has no item rows");
  for (const item of items) item.drawingNo = drawingNo(item.description);
  return { ok: true, value: items };
}

/** The rows of the first table with a whole MATERIAL CODE header cell, from that header row on. */
function itemTable(page: Page): string[][] | undefined {
  for (const rows of page) {
    const header = rows.findIndex((row) => row.some((text) => /^MATERIAL CODE$/i.test(text)));
    if (header !== -1) return rows.slice(header);
  }
  return undefined;
}

/** A new item, or a repeated item row: its lot is added if new and the larger ordered quantity kept (legacy). */
function readItemRow(cells: Cells, items: PoItem[], hasRej: boolean): ParseResult<PoItem> {
  const poItemNo = Number(cells("poItemNo"));
  const where = `item ${poItemNo}`;
  if (poItemNo === 0) return fail("bad-number", `${where}, PO ITM is not an item number`, `${where}, PO ITM`);
  const existing = items.find((item) => item.poItemNo === poItemNo);
  const item = existing ? mergeOrdQty(existing, cells, where) : readItem(cells, poItemNo, where, hasRej);
  if (!item.ok) return item;
  if (!existing) items.push(item.value);
  if (cells("lotNo") === "") return item;
  const lot = readLot(cells, where);
  if (!lot.ok) return lot;
  if (!item.value.lots.some((l) => l.lotNo === lot.value.lotNo)) item.value.lots.push(lot.value);
  return item;
}

function mergeOrdQty(item: PoItem, cells: Cells, where: string): ParseResult<PoItem> {
  const ordQty = readQty(cells("ordQty"), `${where}, ORD QTY`);
  if (!ordQty.ok) return ordQty;
  if (ordQty.value > item.ordQty) item.ordQty = ordQty.value;
  return { ok: true, value: item };
}

function readItem(cells: Cells, poItemNo: number, where: string, hasRej: boolean): ParseResult<PoItem> {
  const materialCode = cells("materialCode");
  if (materialCode === "") {
    return fail("missing-field", `${where}, MATERIAL CODE is empty`, `${where}, MATERIAL CODE`);
  }
  const rate = readMoney(cells("rate"), `${where}, PO RATE`);
  if (!rate.ok) return rate;
  const ordQty = readQty(cells("ordQty"), `${where}, ORD QTY`);
  if (!ordQty.ok) return ordQty;
  // An empty received or rejected cell is 0, as the legacy parser read it.
  const rcdQty = readQty(cells("rcdQty") || "0", `${where}, RCD QTY`);
  if (!rcdQty.ok) return rcdQty;
  // Null when the page has no REJ QTY column.
  const rejQty = hasRej ? readQty(cells("rejQty") || "0", `${where}, REJ QTY`) : { ok: true as const, value: null };
  if (!rejQty.ok) return rejQty;
  return {
    ok: true,
    value: {
      poItemNo,
      materialCode,
      description: "",
      drawingNo: null,
      unit: cells("unit"),
      ordQty: ordQty.value,
      rate: rate.value,
      rcdQty: rcdQty.value,
      rejQty: rejQty.value,
      lots: [],
    },
  };
}

/**
 * A row after an item row: an extra lot, a stop at the REMARKS or TOTAL VALUE row (undefined: no current item until
 * the next item row), or description text.
 */
function readFollowingRow(
  row: readonly string[],
  cells: Cells,
  items: readonly PoItem[],
  current: PoItem,
): ParseResult<PoItem | undefined> {
  const text = row.join("");
  if (text.includes("REMARKS") || text.includes("TOTAL VALUE")) return { ok: true, value: undefined };
  if (cells("lotNo") !== "" && cells("delyQty") !== "") {
    const lot = readLot(cells, `item ${current.poItemNo}`);
    if (!lot.ok) return lot;
    const index = current.lots.findIndex((l) => l.lotNo === lot.value.lotNo);
    if (index === -1) current.lots.push(lot.value);
    else if (lot.value.delyQty > 0) current.lots[index] = lot.value;
    return { ok: true, value: current };
  }
  appendDescription(row, items, current);
  return { ok: true, value: current };
}

function appendDescription(row: readonly string[], items: readonly PoItem[], current: PoItem): void {
  const named = row.findIndex((text) => /^\d{1,2}$/.test(text) && items.some((item) => item.poItemNo === Number(text)));
  const text = row.filter((cell, index) => cell !== "" && index !== named).join(" ");
  if (text === "") return;
  const item = items.find((i) => i.poItemNo === Number(row[named])) ?? current;
  item.description = item.description === "" ? text : `${item.description} ${text}`;
}

function readLot(cells: Cells, item: string): ParseResult<PoLot> {
  const lotText = cells("lotNo");
  if (!WHOLE.test(lotText) || Number(lotText) === 0) {
    return fail("bad-number", `${item}, LOT NO is not a lot number: "${lotText}"`, `${item}, LOT NO`);
  }
  const where = `${item} lot ${Number(lotText)}`;
  const delyQty = readQty(cells("delyQty"), `${where}, DELY QTY`);
  if (!delyQty.ok) return delyQty;
  const delyText = cells("delyDate");
  const delyDate = delyText === "" ? undefined : parsePageDate(delyText);
  if (delyDate && !delyDate.ok) {
    return fail("bad-date", `${where}, DELY DATE is not a date: "${delyText}"`, `${where}, DELY DATE`);
  }
  // INV-46: a non-date ENTRY ALLOW DATE cell (such as "PO Short Closed") is the lot note.
  const entryText = cells("entryAllow");
  const entryAllow = entryText === "" ? undefined : parsePageDate(entryText);
  return {
    ok: true,
    value: {
      lotNo: Number(lotText),
      delyQty: delyQty.value,
      delyDate: delyDate?.value ?? null,
      entryAllowDate: entryAllow?.ok ? entryAllow.value : null,
      entryAllowNote: entryAllow && !entryAllow.ok ? entryText : null,
      destCode: cells("destCode") || null,
    },
  };
}

/** Every drawing number in the description, distinct and sorted, joined by ", " (legacy); null when none. */
function drawingNo(description: string): string | null {
  const found = new Set([...description.matchAll(DRAWING)].map((m) => m[1] ?? "").filter((d) => d.length > 4));
  return found.size === 0 ? null : [...found].sort().join(", ");
}
