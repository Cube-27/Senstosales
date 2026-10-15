// PO file ingest (SPEC-08 §4.2, ARCHITECTURE §7.2, §7.3): parse outside any batch, keep the raw page, then one
// `WriteBatch` per file (INV-50): date guard (INV-42) → header, items and lots → cancel / restore (INV-48) → match
// unmatched SRV lines of this PO number, attaching SRVs stored before the PO (INV-39, INV-40) → recompute, which re-evaluates the date winner (INV-45) → flags → audit.
// DC lines, invoice lines and manual quantities are only read, never written (INV-47).
import type { Db, Instant, Statement } from "@senstosales/db";
import {
  auditLog,
  DbError,
  idRuns,
  insertRows,
  po,
  poItem,
  poLot,
  srv,
  srvItem,
  updateWithVersion,
  WriteBatch,
} from "@senstosales/db";
import type { Qty } from "@senstosales/domain";
import { acceptIncoming, gemcNetRate, gemcSourceRate, matchSrvItem } from "@senstosales/domain";
import type { PoDocument } from "@senstosales/parsers";
import { parsePo } from "@senstosales/parsers";
import type { RouteOutput } from "@senstosales/schemas";
import { eq, inArray } from "drizzle-orm";

import { newId } from "../ids.ts";
import { findPoByNumber } from "../repositories/po.ts";
import { unmatchedSrvLines } from "../repositories/srv.ts";
import type { PoSnapshot, RecomputeDeps } from "./recompute.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";
import type { IngestContext, SourceDocumentDeps } from "./source-documents.ts";
import { ingestContext, storeSourceDocument } from "./source-documents.ts";

export type PoIngestDeps = SourceDocumentDeps;

export interface UploadFile {
  readonly name: string;
  readonly html: string;
}

export type FileResult = RouteOutput<"po.upload">["results"][number];

export type StoredPo = NonNullable<Awaited<ReturnType<typeof findPoByNumber>>>;
type DocItem = PoDocument["items"][number];

/** What storing a PO reads from its page or from the manual form, whose text fields may be blank. */
export type PoValues = Pick<
  PoDocument,
  | "poNumber"
  | "poDate"
  | "enquiry"
  | "quotation"
  | "orderType"
  | "poStatusCode"
  | "amendNo"
  | "poValue"
  | "netPoValue"
  | "remarks"
  | "gemcNumber"
  | "rawHeader"
> & { readonly items: readonly PoItemValues[] };

type PoItemValues = Omit<DocItem, "materialCode" | "description" | "unit"> & {
  readonly materialCode: string | null;
  readonly description: string | null;
  readonly unit: string | null;
};
type Item = PoSnapshot["items"][number];
type MatchedLine = Awaited<ReturnType<typeof unmatchedSrvLines>>[number];

const ZERO = 0 as Qty;
/** Placeholders for a new row's derived columns; recompute sets them in the same batch. */
const DERIVED_PLACEHOLDER = { status: "Pending", dspQty: ZERO, rcdQty: ZERO, rejQty: ZERO, balanceQty: ZERO } as const;

/** The PO ingest use cases, as `createServices` exposes them. */
export const poIngestService = (deps: PoIngestDeps) => ({
  upload: (files: readonly UploadFile[]) => uploadPoFiles(deps, files),
});

export type PoIngestService = ReturnType<typeof poIngestService>;

/** `POST /api/po/upload`: each file in turn, so a later file of the same PO sees the earlier one's rows. */
export async function uploadPoFiles(deps: PoIngestDeps, files: readonly UploadFile[]): Promise<FileResult[]> {
  const ctx = await ingestContext(deps.db, null);
  const results: FileResult[] = [];
  for (const file of files) results.push(await ingestPoFile(deps, file, ctx));
  return results;
}

/**
 * One PO file: accepted, skipped as older than the stored PO (INV-42, INV-44), or failed with a reason (INV-50).
 * `preStored`: a scrape stored the page before parsing (D-0178), so it is not stored again.
 */
export async function ingestPoFile(
  deps: PoIngestDeps,
  file: UploadFile,
  ctx: IngestContext,
  preStored = false,
): Promise<FileResult> {
  const { name } = file;
  const parsed = parsePo(file.html);
  if (!parsed.ok) {
    const { code, message } = parsed.error;
    return { name, status: "failed", reason: `Could not read this PO page (${code}): ${message}` };
  }
  const doc = parsed.value;
  try {
    const stored = await findPoByNumber(deps.db, ctx.supplierId, doc.poNumber);
    if (stored && !acceptIncoming(stored.poDate, doc.poDate)) {
      const reason = `Older than the stored PO ${doc.poNumber} (dated ${stored.poDate}). Nothing was changed.`;
      return { name, status: "skipped", reason };
    }
    // The PO number is the storage key, so an uploaded page is stored once it has parsed and passed the guard (EC-29).
    if (!preStored) {
      await storeSourceDocument(deps, { kind: "po", key: doc.poNumber, html: file.html, docDate: doc.poDate }, ctx);
    }
    const batch = new WriteBatch(deps.db);
    for (const statement of await ingestStatements(deps, doc, stored, ctx)) batch.add(statement);
    await batch.commit();
  } catch (err) {
    // A refused statement, including a PO changed by another upload since the guard read it (INV-95), fails this
    // file only (SPEC-08 §4.3).
    if (!(err instanceof DbError)) throw err;
    const reason = `PO ${doc.poNumber} could not be saved. Nothing from this file was changed.`;
    return { name, status: "failed", reason };
  }
  return { name, status: "accepted", reason: null };
}

async function ingestStatements(
  deps: PoIngestDeps,
  doc: PoDocument,
  stored: StoredPo | undefined,
  ctx: IngestContext,
): Promise<Statement[]> {
  const now = deps.clock.now();
  const { poId, plan, statements } = await storePoStatements(deps, doc, stored, { supplierId: ctx.supplierId, now });
  return [
    ...statements,
    deps.db.build.insert(auditLog).values({
      id: newId(),
      at: now,
      actor: ctx.actor,
      action: "po.ingest",
      entityType: "po",
      entityId: poId,
      before: stored ? { poDate: stored.poDate, amendNo: stored.amendNo } : null,
      after: {
        poNumber: doc.poNumber,
        poDate: doc.poDate,
        amendNo: doc.amendNo,
        cancelledItems: plan.cancelled.map((item) => item.poItemNo),
        restoredItems: plan.restored,
      },
      jobId: ctx.jobId,
    }),
  ];
}

/**
 * The statements that store `values` as the PO `stored`, or as a new PO: header (version-checked against
 * `stored.version`, INV-95), items and lots, cancel and restore (INV-48), matching of unmatched SRV lines (INV-39,
 * INV-40) and recompute. The manual PO form stores through this too, as legacy did. The caller adds the audit row.
 */
export async function storePoStatements(
  deps: RecomputeDeps,
  values: PoValues,
  stored: StoredPo | undefined,
  { supplierId, now }: { supplierId: string; now: Instant },
) {
  const { db } = deps;
  const poId = stored?.id ?? newId();
  const before = stored && (await loadPoSnapshot(db, stored.id));
  const plan = planItems(values, before?.items ?? [], now);
  const matched = (await unmatchedSrvLines(db, supplierId, values.poNumber)).map((line) => ({
    ...line,
    poItemId: matchSrvItem(line, plan.items),
  }));
  const rematched = new Set(matched.map((line) => line.id));
  const snapshot: PoSnapshot = {
    po: { id: poId, supplierId, poDate: values.poDate },
    items: plan.items,
    dcLines: before?.dcLines ?? [],
    invoiceLines: before?.invoiceLines ?? [],
    srvLines: [...(before?.srvLines ?? []).filter((line) => !rematched.has(line.id)), ...matched],
    storedFlags: before?.storedFlags ?? [],
  };
  // INV-19: GEMC when the remarks carry a GEMC number.
  const isGemc = values.gemcNumber !== null;
  const statements = [
    headerStatement(db, values, { poId, isGemc, stored, supplierId }),
    ...itemStatements(db, plan, { poId, isGemc, supplierId, now }),
    ...matchStatements(db, poId, matched),
    ...recomputeStatements(deps, snapshot),
  ];
  return { poId, plan, statements };
}

/**
 * The PO's items once this page is applied: the page's items, keeping the stored id and manual quantity of each one
 * already stored, and the stored items the page lacks, cancelled (INV-48).
 */
function planItems(doc: PoValues, storedItems: readonly Item[], now: Instant) {
  const byNo = new Map(storedItems.map((item) => [item.poItemNo, item]));
  const fromPage = doc.items.map((docItem) => {
    const old = byNo.get(docItem.poItemNo);
    const item: Item = {
      id: old?.id ?? newId(),
      poItemNo: docItem.poItemNo,
      materialCode: docItem.materialCode,
      ordQty: docItem.ordQty,
      poRcdQty: docItem.rcdQty,
      poRejQty: docItem.rejQty,
      cancelledAt: null,
      manualDispatchedQty: old?.manualDispatchedQty ?? ZERO,
      manualSetAt: old?.manualSetAt ?? null,
    };
    return { docItem, item, stored: old !== undefined };
  });
  const onPage = new Set(doc.items.map((item) => item.poItemNo));
  const absent = storedItems.filter((item) => !onPage.has(item.poItemNo));
  return {
    fromPage,
    items: [
      ...fromPage.map((p) => p.item),
      ...absent.map((item) => ({ ...item, cancelledAt: item.cancelledAt ?? now })),
    ]
      // Item-number order, as `loadPoSnapshot` reads them.
      .sort((a, b) => a.poItemNo - b.poItemNo),
    cancelled: absent.filter((item) => item.cancelledAt === null),
    restored: storedItems
      .filter((item) => onPage.has(item.poItemNo) && item.cancelledAt !== null)
      .map((i) => i.poItemNo),
  };
}

type ItemPlan = ReturnType<typeof planItems>;

function headerStatement(
  db: Db,
  doc: PoValues,
  {
    poId,
    isGemc,
    stored,
    supplierId,
  }: { poId: string; isGemc: boolean; stored: StoredPo | undefined; supplierId: string },
): Statement {
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
    isGemc,
    gemcNumber: doc.gemcNumber,
    remarks: doc.remarks,
    rawHeader: doc.rawHeader,
  };
  if (!stored) {
    return db.build.insert(po).values({ ...header, ...DERIVED_PLACEHOLDER, id: poId, supplierId, ordQty: ZERO });
  }
  // A re-ingest changes the document, so an edit opened on the earlier one is stale; and if another upload changed
  // the PO since the guard read it, this batch fails instead of overwriting it (INV-95).
  return updateWithVersion(db, po, poId, stored.version, header);
}

/** The page's item values; a GEMC rate is kept as the GST-inclusive source and its net is derived (INV-16, INV-17). */
function itemValues(item: PoItemValues, isGemc: boolean) {
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
  plan: ItemPlan,
  { poId, isGemc, supplierId, now }: { poId: string; isGemc: boolean; supplierId: string; now: Instant },
): Statement[] {
  const upserts = plan.fromPage.map(({ docItem, item, stored }) => {
    const values = itemValues(docItem, isGemc);
    return stored
      ? db.build
          .update(poItem)
          .set({ ...values, cancelledAt: null })
          .where(eq(poItem.id, item.id))
      : db.build
          .insert(poItem)
          .values({ ...values, ...DERIVED_PLACEHOLDER, uninvoicedQty: ZERO, id: item.id, poId, supplierId });
  });
  const statements: Statement[] = [...upserts];
  const cancelled = plan.cancelled.map((item) => item.id);
  // `cancelledAt` binds one parameter besides the ids.
  for (const ids of idRuns(cancelled, 1)) {
    statements.push(db.build.update(poItem).set({ cancelledAt: now }).where(inArray(poItem.id, ids)));
  }
  // The page's lots replace those of its items; a cancelled item keeps its last lots.
  const replaced = plan.fromPage.filter((p) => p.stored).map((p) => p.item.id);
  for (const ids of idRuns(replaced)) {
    statements.push(db.build.delete(poLot).where(inArray(poLot.poItemId, ids)));
  }
  const lots = plan.fromPage.flatMap(({ docItem, item }) =>
    docItem.lots.map((lot) => ({ ...lot, id: newId(), supplierId, poItemId: item.id })),
  );
  statements.push(...insertRows(db, poLot, lots));
  return statements;
}

/** Unmatched SRV lines take their matched item; SRVs stored while this PO was "not found" now belong to it. */
function matchStatements(db: Db, poId: string, lines: readonly MatchedLine[]): Statement[] {
  if (lines.length === 0) return [];
  const srvIds = [...new Set(lines.map((line) => line.srvId))];
  return [
    // `poId` binds one parameter besides the ids.
    ...idRuns(srvIds, 1).map((ids) => db.build.update(srv).set({ poId }).where(inArray(srv.id, ids))),
    ...lines
      .filter((line) => line.poItemId !== null)
      .map((line) => db.build.update(srvItem).set({ poItemId: line.poItemId }).where(eq(srvItem.id, line.id))),
  ];
}
