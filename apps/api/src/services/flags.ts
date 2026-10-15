// Deviations (SPEC-10 §2): flags list, open counts and acknowledge. Acknowledging changes the flag and writes its
// audit row in one batch, and touches no business data (INV-59).
import type { Db } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";
import type { FlagType } from "@senstosales/domain";
import { FLAG_TYPES } from "@senstosales/domain";

import { ConflictError, NotFoundError } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import { acknowledgeFlag, findFlag, listFlags, openFlagCounts } from "../repositories/flags.ts";
import { audit } from "./audit.ts";

export function flagsService({ db, clock }: { db: Db; clock: Clock }) {
  return {
    list: (query: Parameters<typeof listFlags>[1]) => listFlags(db, query),

    /** The open count for the dashboard and nav (INV-60), and open flags by type, every type listed. */
    async stats() {
      // Built from every type, so the record is complete.
      const openByType = Object.fromEntries(FLAG_TYPES.map((type) => [type, 0])) as Record<FlagType, number>;
      for (const { type, count } of await openFlagCounts(db)) openByType[type] = count;
      return { open: Object.values(openByType).reduce((sum, n) => sum + n, 0), openByType };
    },

    async acknowledge(id: string, note: string | null) {
      const flag = await findFlag(db, id);
      if (flag === undefined) throw new NotFoundError("flag-not-found", "This flag was not found.");
      if (flag.status === "acknowledged") {
        throw new ConflictError("flag-acknowledged", "This flag is already acknowledged.");
      }
      const at = clock.now();
      await new WriteBatch(db)
        .add(acknowledgeFlag(db, id, note, at))
        .add(
          audit(db, at, {
            action: "flag.acknowledge",
            entityType: "reconciliation_issue",
            entityId: id,
            before: { status: flag.status, note: flag.note },
            after: { status: "acknowledged", note },
          }),
        )
        .commit();
      return { ...flag, status: "acknowledged" as const, note, acknowledgedAt: at };
    },
  };
}

export type FlagsService = ReturnType<typeof flagsService>;
