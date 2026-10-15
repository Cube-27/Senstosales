// The legacy Pipeline Configuration as a scrape job request (SPEC-19 §2): specific PO ids when the filter names any,
// else the first `limit` the portal lists. PO ids are checked as the API checks them (INV-97).
import { type RouteInput, zPoId } from "@senstosales/schemas";

export type Kind = "PO" | "SRV";

export interface PipelineConfig {
  /** Batch Limit as typed. */
  readonly limit: string;
  /** PO Number Filter as typed: ids separated by commas or spaces. */
  readonly poNumbers: string;
}

/** The legacy Batch Limit range. */
export const MAX_BATCH = 5000;

export const DEFAULT_CONFIG: PipelineConfig = { limit: "1", poNumbers: "" };

export type ScrapeBody = Extract<RouteInput<"jobs.start">["body"], { sessionId: string }>;

/** The ids typed in the filter. */
export const filterIds = (text: string): string[] => text.split(/[\s,]+/).filter((id) => id !== "");

/** The `jobs.start` body for a scrape of `kind`, or why the configuration cannot start one. */
export function scrapeBody(
  kind: Kind,
  sessionId: string,
  config: PipelineConfig,
): { readonly body: ScrapeBody } | { readonly error: string } {
  const type = kind === "PO" ? "po.scrape" : "srv.scrape";
  const ids = filterIds(config.poNumbers);
  const bad = ids.find((id) => !zPoId.safeParse(id).success);
  if (bad !== undefined) return { error: `Not a PO number: ${bad}` };
  if (ids.length > 0) return { body: { type, sessionId, poIds: ids } };
  const limit = Number(config.limit.trim());
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) {
    return { error: `Batch Limit is a whole number from 1 to ${MAX_BATCH.toLocaleString("en-IN")}` };
  }
  return { body: { type, sessionId, limit } };
}
