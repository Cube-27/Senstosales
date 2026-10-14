// Background jobs, folder-import staging, the BHEL login wizard and health (SPEC-08, SPEC-19, SPEC-07). One job runs
// at a time (INV-98); file locations come from the Storage port, never from a request (C17), so a job names its
// staged files by staging id.
import { z } from "zod";

import { zJob, zJobEvent } from "../entities/job.ts";
import { zJobStatus, zJobType } from "../enums.ts";
import { zCount, zId, zPoId } from "../primitives.ts";
import { zListQuery, zUploadBody } from "./common.ts";

const { enum: type } = zJobType;

/** Scrape options of the legacy BHEL tab: specific PO ids, or the first `limit` found. */
const zScrape = { sessionId: zId, poIds: z.array(zPoId).optional(), limit: z.int().positive().optional() };

export const zJobStartBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal(type["po.import-folder"]), stagingId: zId }),
  z.object({ type: z.literal(type["srv.import-folder"]), stagingId: zId }),
  z.object({ type: z.literal(type["po.scrape"]), ...zScrape }),
  z.object({ type: z.literal(type["srv.scrape"]), ...zScrape }),
  z.object({ type: z.literal(type["recompute-all"]) }),
  z.object({ type: z.literal(type.backup) }),
]);

export const zJobListQuery = zListQuery(["createdAt"], {
  type: zJobType.optional(),
  status: zJobStatus.optional(),
});

export const zJobDetail = z.object({ job: zJob, events: z.array(zJobEvent) });

/** Folder import uploads its files in batches to one staging area; the first batch omits `stagingId`. */
export const zStageBody = zUploadBody.extend({ kind: z.enum(["po", "srv"]), stagingId: zId.optional() });

export const zStaged = z.object({ stagingId: zId, count: zCount });

/** A captcha image as base64 PNG. */
const zCaptcha = z.base64();

export const zBhelSession = z.object({ sessionId: zId, captchaPng: zCaptcha });

/** The supplier code and the stored password are added by the API (INV-81); the user types only the captcha. */
export const zCaptchaBody = z.object({ captcha: z.string().min(1) });

export const zOtpBody = z.object({ otp: z.string().min(1) });

/** A wrong captcha or OTP asks again in place (SPEC-19 §4.2). */
export const zBhelStep = z.discriminatedUnion("step", [
  z.object({ step: z.literal("captcha"), captchaPng: zCaptcha, message: z.string() }),
  z.object({ step: z.literal("otp"), message: z.string().nullable() }),
  z.object({ step: z.literal("ready") }),
]);

/** INV-105: version, schema version and job state. */
export const zHealth = z.object({
  version: z.string(),
  schemaVersion: z.int().nonnegative(),
  job: zJob.pick({ id: true, type: true, status: true }).nullable(),
});
