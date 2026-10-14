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
    const { supplierId: _, ...rest } = row;
    return rest;
  }

  return {
    async list(query: Parameters<typeof listPos>[1]) {
      const page = await listPos(db, query);
      const items = await itemUninvoicedOf(
        db,
        page.items.map((row) => row.id),
      );
      const uninvoiced = (poId: string) =>
        poUninvoicedQty(
          items
            .filter((item) => item.poId === poId)
            .map((item) => ({ uninvoicedQty: item.uninvoicedQty, cancelled: item.cancelledAt !== null })),
        );
      return { ...page, items: page.items.map((row) => ({ ...row, uninvoicedQty: uninvoiced(row.id) })) };
    },

    stats: (filters: PoFilters) => poStats(db, filters),

    async detail(id: string) {
      const po = await load(id);
      const [items, lots, linked, flags] = await Promise.all([
        itemsOfPo(db, id),
        lotsOfPo(db, id),
        linkedDocsOfPo(db, id),
        openFlagsOfPo(db, id),
      ]);
      return {
        po,
        items: items.map(({ supplierId: _, ...item }) => ({
          ...item,
          lots: lots.filter(({ lot }) => lot.poItemId === item.id).map(({ lot: { supplierId: _s, ...lot } }) => lot),
        })),
        linked,
        flags: flags.map(({ supplierId: _, fingerprint: _f, ...flag }) => flag),
      };
    },

    async linked(id: string) {
      await load(id);
      return linkedDocsOfPo(db, id);
    },
  };
}

export type PoService = ReturnType<typeof poService>;
