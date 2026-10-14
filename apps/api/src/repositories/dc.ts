// DC rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { dc, dcItem } from "@senstosales/db";
import { eq } from "drizzle-orm";

/** Every DC line on the PO's items. */
export const dcLinesOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({
        id: dcItem.id,
        dcId: dcItem.dcId,
        poItemId: dcItem.poItemId,
        dspQty: dcItem.dspQty,
        createdAt: dcItem.createdAt,
      })
      .from(dcItem)
      .innerJoin(dc, eq(dc.id, dcItem.dcId))
      .where(eq(dc.poId, poId))
      .orderBy(dcItem.id),
  );
