// Raw BHEL HTML, kept before it is parsed (INV-107, ARCHITECTURE §7.3): stored through `Storage` and recorded in
// `source_document`, so a parser fix can re-parse without re-scraping. Its own batch, committed before the ingest
// batch, so a page whose data is then refused is still kept. A scraped page is stored before it is parsed; an uploaded
// one once it has parsed, since its PO number is the key (EC-29).
import type { Db } from "@senstosales/db";
import { auditLog, sourceDocument, WriteBatch } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { zPoId } from "@senstosales/schemas";
import { and, eq } from "drizzle-orm";

import { onboardingRequired, ValidationError } from "../errors.ts";
import { newId } from "../ids.ts";
import type { Clock } from "../ports/clock.ts";
import type { Storage } from "../ports/storage.ts";
import { findSupplierId } from "../repositories/supplier.ts";
import { ACTOR } from "./audit.ts";

export interface SourceDocumentDeps {
  readonly db: Db;
  readonly storage: Storage;
  readonly clock: Clock;
}

/** Who an ingest writes for: the install's supplier, the audit actor and the job, if one runs it. */
export interface IngestContext {
  readonly supplierId: string;
  readonly actor: string;
  readonly jobId: string | null;
}

/** The context of an upload or a job: the install's supplier and the one `admin` user (ARCHITECTURE §10.1). */
export async function ingestContext(db: Db, jobId: string | null): Promise<IngestContext> {
  const supplierId = await findSupplierId(db);
  if (supplierId === null) throw onboardingRequired();
  return { supplierId, actor: ACTOR, jobId };
}

export interface RawDocument {
  readonly kind: "po" | "srv";
  /** The BHEL PO number the page belongs to; an SRV page is keyed by its PO too. */
  readonly key: string;
  readonly html: string;
  /** The document date, when the page has already been parsed. */
  readonly docDate?: IsoDate;
}

/**
 * Stores `doc.html` at `html/<kind>/<key>.html` and records it. A later page for the same PO replaces both the file
 * and its row. The file is written first, so if the batch then fails the file is newer than its row until the next
 * store for that PO.
 */
export async function storeSourceDocument(
  deps: SourceDocumentDeps,
  doc: RawDocument,
  ctx: IngestContext,
): Promise<{ id: string }> {
  // The key becomes a storage path, so it must be a PO id (C17).
  if (!zPoId.safeParse(doc.key).success) {
    throw new ValidationError("bad-po-number", "This is not a BHEL PO number.");
  }
  const bytes = new TextEncoder().encode(doc.html);
  const storageKey = `html/${doc.kind}/${doc.key}.html`;
  const sha256 = await sha256Hex(bytes);
  await deps.storage.put(storageKey, bytes);

  const id = newId();
  const at = deps.clock.now();
  const { db } = deps;
  const sameDoc = and(
    eq(sourceDocument.supplierId, ctx.supplierId),
    eq(sourceDocument.kind, doc.kind),
    eq(sourceDocument.key, doc.key),
  );
  const recorded = { kind: doc.kind, key: doc.key, storageKey, sha256 };
  await new WriteBatch(db)
    .add(db.build.delete(sourceDocument).where(sameDoc))
    .add(
      db.build.insert(sourceDocument).values({
        ...recorded,
        id,
        supplierId: ctx.supplierId,
        docDate: doc.docDate ?? null,
        ingestedAt: at,
        jobId: ctx.jobId,
      }),
    )
    .add(
      db.build.insert(auditLog).values({
        id: newId(),
        at,
        actor: ctx.actor,
        action: "source_document.store",
        entityType: "source_document",
        entityId: id,
        after: recorded,
        jobId: ctx.jobId,
      }),
    )
    .commit();
  return { id };
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
