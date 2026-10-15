// A background job as the screens follow it (ARCHITECTURE §7.3, §7.4): polled every 2 s while it is queued or
// running, and its summary read at this boundary into the shape the job worker writes.
import type { RouteOutput } from "@senstosales/schemas";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiQuery } from "./api.ts";

export type Job = RouteOutput<"jobs.detail">["job"];

/** The UI polls progress every 2 s (§7.3). */
export const POLL_MS = 2000;

export const isActive = (job: Pick<Job, "status">): boolean => job.status === "queued" || job.status === "running";

/** `jobs.detail`, refetched every {@link POLL_MS} until the job ends. */
export function jobQuery(id: string) {
  return queryOptions({
    ...apiQuery("jobs.detail", { params: { id } }),
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job === undefined || isActive(job) ? POLL_MS : false;
    },
  });
}

const zIssues = z.array(z.object({ document: z.string(), reason: z.string() }));

/** What the job worker keeps in a finished job's row; folder imports add their flags by type. */
const zJobSummary = z.object({
  skippedDocuments: zIssues,
  failedDocuments: zIssues,
  flags: z.record(z.string(), z.number()).default({}),
});

export type JobSummary = z.output<typeof zJobSummary>;

/** A finished job's summary, or `null` while it runs or when the job kept none (a failure before it started). */
export function jobSummary(job: Pick<Job, "summary">): JobSummary | null {
  const parsed = zJobSummary.safeParse(job.summary);
  return parsed.success ? parsed.data : null;
}
