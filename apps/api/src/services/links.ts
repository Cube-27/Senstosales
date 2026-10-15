// SRV link re-resolution (ARCHITECTURE §6.10, INV-37): when a DC or invoice is created, deleted, renumbered or
// re-dated, the SRV items citing its number are linked again in the batch that changes it. The domain decides each
// link (C2); this file reads the citing items and writes the links that change.
import type { Db, Statement } from "@senstosales/db";
import { srvItem } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { docKey, fyOf, resolveDocLink } from "@senstosales/domain";
import { eq } from "drizzle-orm";

import { CITATIONS, srvItemsCiting } from "../repositories/srv.ts";

interface Relink {
  readonly supplierId: string;
  readonly kind: keyof typeof CITATIONS;
  /** The numbers whose citations may resolve differently after the batch. */
  readonly numbers: readonly string[];
  /** Every document of `kind` with one of `numbers`, in any FY, as stored once the batch commits. */
  readonly docs: readonly { id: string; number: string; date: IsoDate }[];
}

/** The SRV items whose link changes, by id, and the statements that store the new links. */
export async function reresolveLinks(db: Db, { supplierId, kind, numbers, docs }: Relink) {
  const changes = new Map<string, string | null>();
  for (const item of await srvItemsCiting(db, supplierId, kind, numbers)) {
    // The read is a superset ("17" contains "7"): only an item citing one of `numbers` is ours to re-resolve, compared
    // through `docKey` as links are (INV-24).
    const fy = fyOf(item.srvDate);
    const cited = item.raw === null ? undefined : docKey(item.raw, fy);
    if (!numbers.some((n) => docKey(n, fy) === cited)) continue;
    const next = resolveDocLink(item.raw, item.srvDate, docs);
    if (next !== item.resolved) changes.set(item.id, next);
  }
  const statements: Statement[] = [...changes].map(([id, next]) =>
    db.build
      .update(srvItem)
      .set({ [CITATIONS[kind].key]: next })
      .where(eq(srvItem.id, id)),
  );
  return { changes, statements };
}
