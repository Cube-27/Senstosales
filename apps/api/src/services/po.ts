// PO list, stats and detail (SPEC-10 §2). Quantities, status and flags are the stored derived columns; the one value
// not stored, a PO's uninvoiced total, comes from the domain (C2).
import type { Db } from "@senstosales/db";
import { poUninvoicedQty } from "@senstosales/domain";

import { NotFoundError } from "../errors.ts";
import type { PoFilters } from "../repositories/po-list.ts";
import {
  findPoRow,
  itemsOfPo,
  itemUninvoicedOf,
  linkedDocsOfPo,
  listPos,
  lotsOfPo,
  openFlagsOfPo,
  poStats,
} from "../repositories/po-list.ts";

export function poService({ db }: { db: Db }) {
  async function load(id: string) {
    const row = await findPoRow(db, id);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    return row;
  }

  return {
    async list(query: Parameters<typeof listPos>[1]) {
      const page = await listPos(db, query);
      const items = await itemUninvoicedOf(
        db,
        page.items.map((row) => row.id),
      );
      const byPo = Map.groupBy(items, (item) => item.poId);
      const uninvoicedQty = (poId: string) =>
        poUninvoicedQty(
          (byPo.get(poId) ?? []).map((item) => ({
            uninvoicedQty: item.uninvoicedQty,
            cancelled: item.cancelledAt !== null,
          })),
        );
      return { ...page, items: page.items.map((row) => ({ ...row, uninvoicedQty: uninvoicedQty(row.id) })) };
    },

    stats: (filters: PoFilters) => poStats(db, filters),

    async detail(id: string) {
      const [po, items, lots, linked, flags] = await Promise.all([
        load(id),
        itemsOfPo(db, id),
        lotsOfPo(db, id),
        linkedDocsOfPo(db, id),
        openFlagsOfPo(db, id),
      ]);
      const lotsOf = Map.groupBy(lots, (lot) => lot.poItemId);
      return { po, items: items.map((item) => ({ ...item, lots: lotsOf.get(item.id) ?? [] })), linked, flags };
    },

    async linked(id: string) {
      const [, linked] = await Promise.all([load(id), linkedDocsOfPo(db, id)]);
      return linked;
    },
  };
}

export type PoService = ReturnType<typeof poService>;
