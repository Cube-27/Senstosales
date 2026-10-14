// `parsePo(html)`: a BHEL PO page as a `PoDocument` (SPEC-06 §4.1). Pure: the page is read, never evaluated (C17).
import { loadPage } from "../html.ts";
import type { ParseResult, PoDocument } from "../types.ts";
import { parsePoHeader } from "./header.ts";
import { parsePoItems } from "./items.ts";

export function parsePo(html: string): ParseResult<PoDocument> {
  const page = loadPage(html);
  const header = parsePoHeader(page);
  if (!header.ok) return header;
  const items = parsePoItems(page);
  if (!items.ok) return items;
  return { ok: true, value: { ...header.value, items: items.value } };
}
