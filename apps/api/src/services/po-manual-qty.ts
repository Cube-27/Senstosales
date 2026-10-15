// The item-level manual dispatched quantity (SPEC-10 §2, A-15, INV-08): one quantity per PO item, never negative,
// with an optional note. It feeds `dsp_qty`, balance and status through recompute, in one batch with its audit row.
import { po, poItem, updateWithVersion, WriteBatch } from "@senstosales/db";
import type { Qty } from "@senstosales/domain";
import { and, eq } from "drizzle-orm";

import { fieldError, NotFoundError } from "../errors.ts";
import { findPoRow, itemsOfPo } from "../repositories/po-list.ts";
import { audit } from "./audit.ts";
import type { ServiceDeps } from "./index.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";

export function poManualQtyService({ db, clock }: Pick<ServiceDeps, "db" | "clock">) {
  return {
    /** Sets the item's manual quantity and note; the item and its PO are recomputed in the same batch (INV-08). */
    async set(poId: string, itemId: string, { qty, note }: { qty: Qty; note?: string | undefined }) {
      if (qty < 0) throw fieldError("negative-qty", "qty", "The quantity cannot be negative.");
      // The version is read before the snapshot: a PO changed in between fails the batch instead of being recomputed
      // from rows it no longer has (INV-95).
      const row = await findPoRow(db, poId);
      if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
      const [items, snapshot] = await Promise.all([itemsOfPo(db, poId), loadPoSnapshot(db, poId)]);
      const item = items.find((i) => i.id === itemId);
      if (item === undefined) throw new NotFoundError("po-item-not-found", "This PO item was not found.");

      const now = clock.now();
      const manual = { manualDispatchedQty: qty, manualNote: note ?? null };
      const batch = new WriteBatch(db);
      batch.add(updateWithVersion(db, po, poId, row.version, {}));
      batch.add(
        db.build
          .update(poItem)
          .set({ ...manual, manualSetAt: now })
          .where(and(eq(poItem.id, itemId), eq(poItem.poId, poId))),
      );
      const changed = snapshot.items.map((i) =>
        i.id === itemId ? { ...i, manualDispatchedQty: qty, manualSetAt: now } : i,
      );
      for (const statement of recomputeStatements({ db, clock }, { ...snapshot, items: changed })) batch.add(statement);
      batch.add(
        audit(db, now, {
          action: "po_item.manual_dispatched",
          entityType: "po_item",
          entityId: itemId,
          before: { manualDispatchedQty: item.manualDispatchedQty, manualNote: item.manualNote },
          after: manual,
        }),
      );
      await batch.commit();
      return (await itemsOfPo(db, poId)).find((i) => i.id === itemId)!;
    },
  };
}

export type PoManualQtyService = ReturnType<typeof poManualQtyService>;
