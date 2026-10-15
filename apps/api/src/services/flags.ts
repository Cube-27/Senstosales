// Deviations (SPEC-10 §2): flags list, open counts and acknowledge. Acknowledging changes the flag and writes its
// audit row in one batch, and touches no business data (INV-59).
import type { Db } from "@senstosales/db";
import { ConflictError as StaleRowError, WriteBatch } from "@senstosales/db";
import type { FlagType } from "@senstosales/domain";
import { FLAG_TYPES } from "@senstosales/domain";

import { ConflictError, NotFoundError } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import type { FlagListQuery } from "../repositories/flags.ts";
import { acknowledgeFlag, findFlag, listFlags, openFlagCounts } from "../repositories/flags.ts";
import { audit } from "./audit.ts";

const alreadyAcknowledged = () => new ConflictError("flag-acknowledged", "This flag is already acknowledged.");

export function flagsService({ db, clock }: { db: Db; clock: Clock }) {
  return {
    list: (query: FlagListQuery) => listFlags(db, query),

    /** The open count for the dashboard and nav (INV-60), and open flags by type, every type listed. */
    async stats() {
      // Built from every type, so the record is complete.
      const openByType = Object.fromEntries(FLAG_TYPES.map((type) => [type, 0])) as Record<FlagType, number>;
      let open = 0;
      for (const { type, count } of await openFlagCounts(db)) {
        openByType[type] = count;
        open += count;
      }
      return { open, openByType };
    },

    async acknowledge(id: string, note: string | null) {
      const flag = await findFlag(db, id);
      if (flag === undefined) throw new NotFoundError("flag-not-found", "This flag was not found.");
      if (flag.status === "acknowledged") throw alreadyAcknowledged();
      const at = clock.now();
      const batch = new WriteBatch(db).add(acknowledgeFlag(db, id, note, at)).add(
        audit(db, at, {
          action: "flag.acknowledge",
          entityType: "reconciliation_issue",
          entityId: id,
          before: { status: flag.status, note: flag.note },
          after: { status: "acknowledged", note },
        }),
      );
      try {
        await batch.commit();
      } catch (err) {
        // Acknowledged by a concurrent request after the read above: the batch wrote nothing (INV-59).
        if (err instanceof StaleRowError && err.table === "reconciliation_issue") throw alreadyAcknowledged();
        throw err;
      }
      return { ...flag, status: "acknowledged" as const, note, acknowledgedAt: at };
    },
  };
}

export type FlagsService = ReturnType<typeof flagsService>;
