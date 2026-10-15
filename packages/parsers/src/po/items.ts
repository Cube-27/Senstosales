// PO items and their lots, read from the item table (SPEC-06 §2). The row rules are the legacy parser's: an item row
// starts with a PO ITM number, a row with LOT NO and DELY QTY adds a lot to the item above, and any other row is
// description text for the item a 1-2 digit cell names, else the item above. Rows are kept as printed (A2-10): an item
// printed again (one row per lot) keeps its first row's values, every lot row is stored with its raw cells, and PO ITM
// 0 or LOT NO 0 is kept and flagged downstream, never refused.
import { parsePageDate } from "../dates.ts";
import { fail, isItemNumber, readMoney, readQty } from "../fields.ts";
import { mapColumnsByHeader, rowByHeader } from "../html.ts";
import type { Page } from "../html.ts";
import type { ParseResult, PoDocument } from "../types.ts";

type PoItem = PoDocument["items"][number];
type PoLot = PoItem["lots"][number];

/** Column -> header text. A header cell names the column when it contains the text (legacy). */
const HEADERS = {
  poItemNo: "PO ITM",
  materialCode: "MATERIAL CODE",
  mtrlCat: "MTRL CAT",
  unit: "UNIT",
  rate: "PO RATE",
  ordQty: "ORD QTY",
  rcdQty: "RCD QTY",
  rejQty: "REJ QTY",
  itemValue: "ITEM VALUE",
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

/** A drawing number in the description (the legacy pattern); a match shorter than 5 characters is not one. */
const DRAWING = /(?:DRG|DRAWING)[ .-]*(?:NO[.-]*\s*)?(?::\s*)?([A-Z0-9][A-Z0-9./-]*)/gi;
/** A drawing number may run into one of these words; it then ends before the last of them. */
const RUN_IN = /^(?:ITEM|VAR|REV)/i;
const WHOLE = /^\d+$/;

/** One table row, read by column; a column the table lacks reads as "". `raw()` is the row by header text. */
type Cells = ((column: Column) => string) & { raw: () => Record<string, string> };

export function parsePoItems(page: Page): ParseResult<PoItem[]> {
  const rows = itemTable(page);
  if (!rows) return fail("no-item-table", "The page has no item table (no MATERIAL CODE header row)");
  const columns = mapColumnsByHeader(rows[0] ?? [], PATTERNS);
  const missing = REQUIRED.find((column) => columns[column] === undefined);
  if (missing) return fail("missing-field", `The item table has no ${HEADERS[missing]} column`, HEADERS[missing]);

  const hasRej = columns.rejQty !== undefined;
  const items: PoItem[] = [];
  let current: PoItem | undefined;
  const header = rows[0] ?? [];
  for (const row of rows.slice(1)) {
    const cells: Cells = Object.assign(
      (column: Column) => {
        const index = columns[column];
        return index === undefined ? "" : (row[index] ?? "");
      },
      { raw: () => rowByHeader(header, row) },
    );
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

/** A new item, or the same item printed again: the item keeps its first row's values, and the row's lot is added. */
function readItemRow(cells: Cells, items: PoItem[], hasRej: boolean): ParseResult<PoItem> {
  const text = cells("poItemNo");
  const where = `item ${text}`;
  if (!isItemNumber(text)) return fail("bad-number", `${where}, PO ITM is not an item number`, `${where}, PO ITM`);
  const poItemNo = Number(text);
  let item = items.find((i) => i.poItemNo === poItemNo);
  if (!item) {
    const read = readItem(cells, poItemNo, `item ${poItemNo}`, hasRej);
    if (!read.ok) return read;
    item = read.value;
    items.push(item);
  }
  if (cells("lotNo") === "") return { ok: true, value: item };
  const lot = readLot(cells, `item ${poItemNo}`);
  if (!lot.ok) return lot;
  item.lots.push(lot.value);
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
  const valueText = cells("itemValue");
  const itemValue =
    valueText === "" ? { ok: true as const, value: null } : readMoney(valueText, `${where}, ITEM VALUE`);
  if (!itemValue.ok) return itemValue;
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
      mtrlCat: cells("mtrlCat") || null,
      ordQty: ordQty.value,
      rate: rate.value,
      rcdQty: rcdQty.value,
      itemValue: itemValue.value,
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
    current.lots.push(lot.value);
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
  if (!isItemNumber(lotText)) {
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
      rawRow: cells.raw(),
    },
  };
}

/** Every drawing number in the description, distinct and sorted, joined by ", " (legacy); null when none. */
function drawingNo(description: string): string | null {
  const found = new Set<string>();
  for (const match of description.matchAll(DRAWING)) {
    const token = drawingToken(match[1] ?? "", description[match.index + match[0].length]);
    if (token !== undefined && token.length > 4) found.add(token);
  }
  // Code-unit order, as the legacy parser sorted.
  return found.size === 0 ? null : [...found].sort((a, b) => Number(a > b) - Number(a < b)).join(", ");
}

/**
 * The drawing number in `token` (a run of number characters), given the character after it: the whole run when a
 * space, a comma or the end follows, else the run up to the last ITEM, VAR or REV inside it. This is the legacy
 * pattern's lookahead, done without backtracking.
 */
function drawingToken(token: string, next: string | undefined): string | undefined {
  // A full stop after the number ends the sentence; it is not part of the number.
  if (next === undefined || /[\s,]/.test(next)) {
    let end = token.length;
    while (token[end - 1] === ".") end--;
    return token.slice(0, end);
  }
  for (let end = token.length - 1; end > 0; end--) {
    if (RUN_IN.test(token.slice(end))) return token.slice(0, end);
  }
  return undefined;
}
