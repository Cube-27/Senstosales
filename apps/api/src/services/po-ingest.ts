// PO file ingest (SPEC-08 §4.2, ARCHITECTURE §7.2, §7.3): parse outside any batch, keep the raw page, then one
// `WriteBatch` per file (INV-50): date guard (INV-42) → header, items and lots → cancel / restore (INV-48) → attach
// SRVs stored before the PO (INV-39, INV-40) → recompute, which re-evaluates the date winner (INV-45) → flags → audit.
// DC lines, invoice lines and manual quantities are only read, never written (INV-47).
import type { Db, Instant, Statement } from "@senstosales/db";
import { auditLog, DbError, po, poItem, poLot, sourceDocument, srv, srvItem, WriteBatch } from "@senstosales/db";
import type { Qty } from "@senstosales/domain";
import { acceptIncoming, gemcNetRate, gemcSourceRate, matchSrvItem } from "@senstosales/domain";
import type { PoDocument } from "@senstosales/parsers";
import { parsePo } from "@senstosales/parsers";
import type { RouteOutput } from "@senstosales/schemas";
import { eq, inArray, sql } from "drizzle-orm";

import { ConflictError } from "../errors.ts";
import { newId } from "../ids.ts";
import { findPoByNumber } from "../repositories/po.ts";
import { unattachedSrvLines } from "../repositories/srv.ts";
import { findSupplierId } from "../repositories/supplier.ts";
import type { PoSnapshot } from "./recompute.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";
import type { IngestContext, SourceDocumentDeps } from "./source-documents.ts";
import { storeSourceDocument } from "./source-documents.ts";

export type PoIngestDeps = SourceDocumentDeps;

export interface UploadFile {
  readonly name: string;
  readonly html: string;
}

export type FileResult = RouteOutput<"po.upload">["results"][number];

type StoredPo = NonNullable<Awaited<ReturnType<typeof findPoByNumber>>>;
type DocItem = PoDocument["items"][number];
type Item = PoSnapshot["items"][number];
type AttachedLine = Awaited<ReturnType<typeof unattachedSrvLines>>[number];

/** The one `admin` user (ARCHITECTURE §10.1). */
const ACTOR = "admin";
const ZERO = 0 as Qty;
/** Placeholders for a new row's derived columns; recompute sets them in the same batch. */
const DERIVED_PLACEHOLDER = { status: "Pending", dspQty: ZERO, rcdQty: ZERO, rejQty: ZERO, balanceQty: ZERO } as const;

/** `POST /api/po/upload`: each file in turn, so a later file of the same PO sees the earlier one's rows. */
export async function uploadPoFiles(deps: PoIngestDeps, files: readonly UploadFile[]): Promise<FileResult[]> {
  const supplierId = await findSupplierId(deps.db);
  if (supplierId === null) {
    throw new ConflictError("onboarding-required", "Finish setting up the app before uploading.");
  }
  const ctx: IngestContext = { supplierId, actor: ACTOR, jobId: null };
  const results: FileResult[] = [];
  for (const file of files) results.push(await ingestPoFile(deps, file, ctx));
  return results;
}

/** One PO file: accepted, skipped as older than the stored PO (INV-42, INV-44), or failed with a reason (INV-50). */
export async function ingestPoFile(deps: PoIngestDeps, file: UploadFile, ctx: IngestContext): Promise<FileResult> {
  const { name } = file;
  const parsed = parsePo(file.html);
  if (!parsed.ok) {
    const { code, message } = parsed.error;
    return { name, status: "failed", reason: `Could not read this PO page (${code}): ${message}` };
  }
  const doc = parsed.value;
  // The PO number is the storage key, so an uploaded page is stored once it has parsed (EC-29).
  const source = await storeSourceDocument(deps, { kind: "po", key: doc.poNumber, html: file.html }, ctx);
  const stored = await findPoByNumber(deps.db, ctx.supplierId, doc.poNumber);
  if (stored && !acceptIncoming(stored.poDate, doc.poDate)) {
    const reason = `Older than the stored PO ${doc.poNumber} (dated ${stored.poDate}). Nothing was changed.`;
    return { name, status: "skipped", reason };
  }
  const batch = new WriteBatch(deps.db);
  for (const statement of await ingestStatements(deps, doc, stored, source.id, ctx)) batch.add(statement);
  try {
    await batch.commit();
  } catch (err) {
    if (!(err instanceof DbError)) throw err;
    return {
      name,
      status: "failed",
      reason: `PO ${doc.poNumber} could not be saved. Nothing from this file was changed.`,
    };
  }
  return { name, status: "accepted", reason: null };
}

async function ingestStatements(
  deps: PoIngestDeps,
  doc: PoDocument,
  stored: StoredPo | undefined,
  sourceId: string,
  ctx: IngestContext,
): Promise<Statement[]> {
  const { db } = deps;
  const now = deps.clock.now();
  const poId = stored?.id ?? newId();
  const before = stored && (await loadPoSnapshot(db, stored.id));
  const plan = planItems(doc, before?.items ?? [], now);
  const attached = (await unattachedSrvLines(db, ctx.supplierId, doc.poNumber)).map((line) => ({
    ...line,
    poItemId: matchLine(line, plan.items),
  }));
  const snapshot: PoSnapshot = {
    po: { id: poId, supplierId: ctx.supplierId, poDate: doc.poDate },
    items: plan.items,
    dcLines: before?.dcLines ?? [],
    invoiceLines: before?.invoiceLines ?? [],
    srvLines: [...(before?.srvLines ?? []), ...attached],
    storedFlags: before?.storedFlags ?? [],
  };
  const changes = { poNumber: doc.poNumber, poDate: doc.poDate, amendNo: doc.amendNo };
  return [
    headerStatement(db, doc, poId, stored !== undefined, ctx.supplierId),
    ...itemStatements(db, doc, plan, { poId, supplierId: ctx.supplierId, now }),
    ...attachStatements(db, poId, attached),
    ...recomputeStatements(deps, snapshot),
    db.build.update(sourceDocument).set({ docDate: doc.poDate }).where(eq(sourceDocument.id, sourceId)),
    db.build.insert(auditLog).values({
      id: newId(),
      at: now,
      actor: ctx.actor,
      action: "po.ingest",
      entityType: "po",
      entityId: poId,
      before: stored ? { poDate: stored.poDate, amendNo: stored.amendNo } : null,
      after: { ...changes, cancelledItems: plan.cancelled, restoredItems: plan.restored },
      jobId: ctx.jobId,
    }),
  ];
}

/**
 * The PO's items once this page is applied: the page's items, keeping the stored id and manual quantity of each one
 * already stored, and the stored items the page lacks, cancelled (INV-48).
 */
function planItems(doc: PoDocument, storedItems: readonly Item[], now: Instant) {
  const byNo = new Map(storedItems.map((item) => [item.poItemNo, item]));
  const onPage = new Set(doc.items.map((item) => item.poItemNo));
  const fromPage = doc.items.map((item): Item => {
    const old = byNo.get(item.poItemNo);
    return {
      id: old?.id ?? newId(),
      poItemNo: item.poItemNo,
      materialCode: item.materialCode,
      ordQty: item.ordQty,
      poRcdQty: item.rcdQty,
      poRejQty: item.rejQty,
      cancelledAt: null,
      manualDispatchedQty: old?.manualDispatchedQty ?? ZERO,
      manualSetAt: old?.manualSetAt ?? null,
    };
  });
  const absent = storedItems.filter((item) => !onPage.has(item.poItemNo));
  const newlyCancelled = absent.filter((item) => item.cancelledAt === null);
  return {
    fromPage,
    items: [...fromPage, ...absent.map((item) => ({ ...item, cancelledAt: item.cancelledAt ?? now }))].sort(
      (a, b) => a.poItemNo - b.poItemNo,
    ),
    storedIds: new Set(storedItems.map((item) => item.id)),
    cancelledIds: newlyCancelled.map((item) => item.id),
    cancelled: newlyCancelled.map((item) => item.poItemNo),
    restored: storedItems
      .filter((item) => onPage.has(item.poItemNo) && item.cancelledAt !== null)
      .map((item) => item.poItemNo),
  };
}

type ItemPlan = ReturnType<typeof planItems>;

function headerStatement(db: Db, doc: PoDocument, poId: string, exists: boolean, supplierId: string): Statement {
  const header = {
    poNumber: doc.poNumber,
    poDate: doc.poDate,
    enquiry: doc.enquiry,
    quotation: doc.quotation,
    orderType: doc.orderType,
    bhelStatusCode: doc.poStatusCode,
    amendNo: doc.amendNo,
    poValue: doc.poValue,
    netPoValue: doc.netPoValue,
    // INV-19: GEMC when the remarks carry a GEMC number.
    isGemc: doc.gemcNumber !== null,
    gemcNumber: doc.gemcNumber,
    remarks: doc.remarks,
    rawHeader: doc.rawHeader,
  };
  if (!exists) {
    return db.build.insert(po).values({ ...header, ...DERIVED_PLACEHOLDER, id: poId, supplierId, ordQty: ZERO });
  }
  // A re-ingest changes the document, so an edit opened on the earlier one is stale (INV-95).
  return db.build
    .update(po)
    .set({ ...header, version: sql`${po.version} + 1` })
    .where(eq(po.id, poId));
}

/** The page's item values; a GEMC rate is kept as the GST-inclusive source and its net is derived (INV-16, INV-17). */
function itemValues(item: DocItem, isGemc: boolean) {
  return {
    poItemNo: item.poItemNo,
    materialCode: item.materialCode,
    description: item.description,
    drawingNo: item.drawingNo,
    unit: item.unit,
    ordQty: item.ordQty,
    rateSource: item.rate,
    rate: isGemc ? gemcNetRate(gemcSourceRate(item.rate)) : item.rate,
    poRcdQty: item.rcdQty,
    poRejQty: item.rejQty,
  };
}

function itemStatements(
  db: Db,
  doc: PoDocument,
  plan: ItemPlan,
  { poId, supplierId, now }: { poId: string; supplierId: string; now: Instant },
): Statement[] {
  const isGemc = doc.gemcNumber !== null;
  const statements: Statement[] = [];
  // `plan.fromPage` is in the page's order.
  const lots = doc.items.flatMap((docItem, i) => {
    const id = plan.fromPage[i]?.id ?? newId();
    const values = itemValues(docItem, isGemc);
    statements.push(
      plan.storedIds.has(id)
        ? db.build
            .update(poItem)
            .set({ ...values, cancelledAt: null })
            .where(eq(poItem.id, id))
        : db.build
            .insert(poItem)
            .values({ ...values, ...DERIVED_PLACEHOLDER, uninvoicedQty: ZERO, id, poId, supplierId }),
    );
    return docItem.lots.map((lot) => ({ ...lot, id: newId(), supplierId, poItemId: id }));
  });
  if (plan.cancelledIds.length > 0) {
    statements.push(db.build.update(poItem).set({ cancelledAt: now }).where(inArray(poItem.id, plan.cancelledIds)));
  }
  // The page's lots replace those of its items; a cancelled item keeps its last lots.
  const replaced = plan.fromPage.map((item) => item.id).filter((id) => plan.storedIds.has(id));
  if (replaced.length > 0) statements.push(db.build.delete(poLot).where(inArray(poLot.poItemId, replaced)));
  if (lots.length > 0) statements.push(db.build.insert(poLot).values(lots));
  return statements;
}

/** INV-39: an SRV line's PO item by material code, the SRV row's item number deciding between equal codes. */
function matchLine(line: AttachedLine, items: readonly Item[]): string | null {
  const { materialCode, poItemNo } = line;
  if (materialCode === null) return null;
  const refs = items.flatMap((item) =>
    item.materialCode === null ? [] : [{ id: item.id, materialCode: item.materialCode, poItemNo: item.poItemNo }],
  );
  return matchSrvItem({ materialCode, poItemNo }, refs);
}

/** SRVs stored while this PO was "not found" now belong to it, with each line's matched item. */
function attachStatements(db: Db, poId: string, lines: readonly AttachedLine[]): Statement[] {
  if (lines.length === 0) return [];
  const srvIds = [...new Set(lines.map((line) => line.srvId))];
  return [
    db.build.update(srv).set({ poId }).where(inArray(srv.id, srvIds)),
    ...lines
      .filter((line) => line.poItemId !== null)
      .map((line) => db.build.update(srvItem).set({ poItemId: line.poItemId }).where(eq(srvItem.id, line.id))),
  ];
}
