// Writes built from a read and guarded by its versions (D-0220, D-0247).
import { ConflictError as StaleVersionError } from "@senstosales/db";

/**
 * A write whose guarded rows changed between its read and its commit is rebuilt from fresh rows; the guard makes it
 * fail instead of writing derived columns from rows it never saw. A bound keeps a row that never settles from looping.
 */
const ATTEMPTS = 3;

/** Runs `attempt` again while its batch fails on a stale row of one of `tables`, at most `ATTEMPTS` times. */
export async function retrying<T>(tables: readonly string[], attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      const retry = err instanceof StaleVersionError && tables.includes(err.table) && n < ATTEMPTS;
      if (!retry) throw err;
    }
  }
}
