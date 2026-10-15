// BHEL sync (SPEC-19 §2, ARCHITECTURE §7.5): the login wizard and the `po.scrape` / `srv.scrape` jobs. The wizard opens
// a scraper session under a new id and shows its captcha; the API adds the supplier code and the stored password to the
// captcha the user typed (INV-81), then takes the OTP. A scrape job names that session id: it lists PO ids (or takes
// the ones given), then fetches, stores and ingests each page in turn through the folder-import ingest, so a page that
// cannot be fetched fails as a job event and the others still commit. The session closes when the job ends (INV-100).
import type { RouteOutput } from "@senstosales/schemas";
import type { Scraper, ScraperSession, Sessions } from "@senstosales/scraper";
import { ScraperError } from "@senstosales/scraper";

import { ConflictError, NotFoundError, ValidationError, type AppError } from "../errors.ts";
import { newId } from "../ids.ts";
import type { DocumentResult, JobHandler, JobHandlers, JobStart } from "../ports/jobs.ts";
import type { Secrets } from "../ports/secrets.ts";
import { findSupplier } from "../repositories/supplier.ts";
import { flagsSummary } from "./folder-import.ts";
import { ingestPoFile } from "./po-ingest.ts";
import { ingestSrvFile } from "./srv-ingest.ts";
import type { SourceDocumentDeps } from "./source-documents.ts";
import { ingestContext, storeSourceDocument } from "./source-documents.ts";

/** The scraper and the open sessions; the platform entry supplies both, or neither when sync is unavailable. */
export interface BhelDeps {
  readonly scraper: Scraper;
  readonly sessions: Sessions;
}

type Step = RouteOutput<"bhel.otp">;

const sessionEnded = () => new NotFoundError("bhel-session-ended", "This BHEL login has ended. Start the sync again.");

/** The open session under `sessionId`; once it has ended, a 404 to the wizard and a failed job to a scrape. */
function openSession(sessions: Sessions, sessionId: string): ScraperSession {
  const open = sessions.get(sessionId);
  if (open === undefined) throw sessionEnded();
  return open;
}

/** A scraper failure as the API answers it; the messages are the port's fixed plain ones (INV-81, INV-106). */
function appError(err: ScraperError): AppError {
  switch (err.code) {
    case "invalid-po-id":
      return new ValidationError(err.code, err.message);
    case "closed":
      return sessionEnded();
    default:
      return new ConflictError(err.code, err.message);
  }
}

/** Runs `call`, answering a scraper failure as an `AppError`. */
async function answer<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw err instanceof ScraperError ? appError(err) : err;
  }
}

const base64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

export function bhelWizardService(deps: SourceDocumentDeps & BhelDeps & { secrets: Secrets }) {
  const { scraper, sessions, secrets } = deps;

  /** The supplier code and the stored password, or the step the user must do in Settings first. */
  async function login(): Promise<{ supplierCode: string; password: string }> {
    const supplierCode = (await findSupplier(deps.db))?.bhelSupplierCode ?? null;
    if (supplierCode === null || supplierCode === "") {
      throw new ConflictError(
        "bhel-supplier-code-missing",
        "Add the BHEL supplier code to the supplier details first.",
      );
    }
    const password = await secrets.get("bhel-password");
    if (password === null)
      throw new ConflictError("bhel-password-missing", "Save the BHEL password in Settings first.");
    return { supplierCode, password };
  }

  return {
    /** Opens a session and returns its captcha. Edge missing or the portal down: a plain 409, nothing kept. */
    async start(): Promise<RouteOutput<"bhel.start">> {
      await login();
      const sessionId = newId();
      return answer(async () => {
        const opened = await sessions.open(sessionId, scraper);
        try {
          return { sessionId, captchaPng: base64(await opened.prepareLogin()) };
        } catch (err) {
          await sessions.close(sessionId);
          throw err;
        }
      });
    },

    /** A wrong captcha answers a fresh one to type, in place (SPEC-19 §4.2). */
    async captcha(sessionId: string, captcha: string): Promise<Step> {
      const open = openSession(sessions, sessionId);
      const { supplierCode, password } = await login();
      return answer(async () => {
        try {
          await open.submitCaptcha(supplierCode, password, captcha);
          return { step: "otp", message: null };
        } catch (err) {
          if (!(err instanceof ScraperError) || err.code !== "wrong-captcha") throw err;
          return { step: "captcha", captchaPng: base64(await open.prepareLogin()), message: err.message };
        }
      });
    },

    /** A wrong OTP is asked again in place. */
    async otp(sessionId: string, otp: string): Promise<Step> {
      const open = openSession(sessions, sessionId);
      return answer(async () => {
        try {
          await open.submitOtp(otp);
          return { step: "ready" };
        } catch (err) {
          if (!(err instanceof ScraperError) || err.code !== "wrong-otp") throw err;
          return { step: "otp", message: err.message };
        }
      });
    },

    async close(sessionId: string): Promise<{ ok: true }> {
      await sessions.close(sessionId);
      return { ok: true };
    },
  };
}

export type BhelWizardService = ReturnType<typeof bhelWizardService>;

type ScrapeStart = Extract<JobStart, { sessionId: string }>;
type Kind = "po" | "srv";

/** The handlers of both scrape job types. */
export function bhelScrapeHandlers(deps: SourceDocumentDeps & BhelDeps): JobHandlers {
  return {
    "po.scrape": scrapeHandler(deps, "po"),
    "srv.scrape": scrapeHandler(deps, "srv"),
  };
}

function scrapeHandler<S extends ScrapeStart>(deps: SourceDocumentDeps & BhelDeps, kind: Kind): JobHandler<S> {
  const { sessions } = deps;
  const ingest = kind === "po" ? ingestPoFile : ingestSrvFile;
  const label = (poId: string) => `${kind === "po" ? "PO" : "SRV of PO"} ${poId}`;
  const session = ({ sessionId }: S) => openSession(sessions, sessionId);

  return {
    async documents(start) {
      const poIds = start.poIds ?? (await session(start).listPoIds());
      const chosen = start.limit === undefined ? poIds : poIds.slice(0, start.limit);
      return chosen.map((poId) => ({ key: poId, label: label(poId) }));
    },

    async process(poId, start, jobId): Promise<DocumentResult> {
      const open = session(start);
      let html: string;
      try {
        html = await (kind === "po" ? open.fetchPoHtml(poId) : open.fetchSrvHtml(poId));
      } catch (err) {
        if (!(err instanceof ScraperError)) throw err;
        return { outcome: "failed", reason: err.message };
      }
      // A scrape knows the PO id before parsing, so the page is kept even when it then does not parse (D-0178).
      const ctx = await ingestContext(deps.db, jobId);
      await storeSourceDocument(deps, { kind, key: poId, html }, ctx);
      const result = await ingest(deps, { name: label(poId), html }, ctx, true);
      return result.status === "accepted"
        ? { outcome: "done" }
        : { outcome: result.status, reason: result.reason ?? "" };
    },

    /** Closes the session, however the job ended (INV-100), and adds the flags the sync opened. */
    async finish({ sessionId }, jobId) {
      await sessions.close(sessionId);
      return flagsSummary(deps.db, jobId);
    },
  };
}
