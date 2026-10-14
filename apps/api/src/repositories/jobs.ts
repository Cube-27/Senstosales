// Job rows (ARCHITECTURE §7.3). Plain reads; the Jobs port and its worker are SPEC-08's.
import type { Db } from "@senstosales/db";
import { job } from "@senstosales/db";
import { asc, desc, eq, inArray } from "drizzle-orm";

/** The running job, else the oldest queued one, else `null`. */
export async function findActiveJob(db: Db) {
  const [row] = await db.query(
    db.build
      .select({ id: job.id, type: job.type, status: job.status })
      .from(job)
      .where(inArray(job.status, ["running", "queued"]))
      .orderBy(desc(eq(job.status, "running")), asc(job.createdAt))
      .limit(1),
  );
  return row ?? null;
}
