// SRV file ingest (SPEC-08 §4.2, ARCHITECTURE §6.10, §7.2, §7.3): parse outside any batch (an SRV that cannot be read
// is reported and the file's other SRVs are stored, A2-10), keep the raw page, then one `WriteBatch` per file: for each SRV not older than the stored one
// (INV-43), replace its row and items, matching items (INV-39), keeping the cited numbers as text (INV-38) and resolving
// them in the SRV date's FY (INV-37) → recompute the PO and its new flags (INV-52, INV-53) → audit. An SRV whose PO is
// not stored is kept unattached and changes nothing (INV-40).
import type { Statement } from "@senstosales/db";
import { DbError, insertRows, srv, srvItem, WriteBatch } from "@senstosales/db";
import type { IsoDate, Qty } from "@senstosales/domain";
import { acceptIncoming, compareIsoDate, fyOf, matchSrvItem, resolveDocLink } from "@senstosales/domain";
import type { SrvDocument } from "@senstosales/parsers";
import { parseSrv } from "@senstosales/parsers";
import { eq } from "drizzle-orm";

import { newId } from "../ids.ts";
import { insertAudit } from "../repositories/audit.ts";
import { dcNumbersOf } from "../repositories/dc.ts";
import { invoiceNumbersOf } from "../repositories/invoice.ts";
import { findPoByNumber } from "../repositories/po.ts";
import { srvItemKeysOf, srvsOfPoNumber } from "../repositories/srv.ts";
import type { FileResult, UploadFile } from "./po-ingest.ts";
import type { PoSnapshot } from "./recompute.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";
import type { IngestContext, SourceDocumentDeps } from "./source-documents.ts";
import { ingestContext, storeSourceDocument } from "./source-documents.ts";

export type SrvIngestDeps = SourceDocumentDeps;

type StoredSrv = Awaited<ReturnType<typeof srvsOfPoNumber>>[number];
type SrvLine = PoSnapshot["srvLines"][number];

const ZERO = 0 as Qty;

/** The SRV ingest use cases, as `createServices` exposes them. */
export const srvIngestService = (deps: SrvIngestDeps) => ({
  upload: (files: readonly UploadFile[]) => uploadSrvFiles(deps, files),
});

export type SrvIngestService = ReturnType<typeof srvIngestService>;

/** `POST /api/srv/upload`: each file in turn, so a later file of the same PO sees the earlier one's rows. */
export async function uploadSrvFiles(deps: SrvIngestDeps, files: readonly UploadFile[]): Promise<FileResult[]> {
  const ctx = await ingestContext(deps.db, null);
  const results: FileResult[] = [];
  for (const file of files) results.push(await ingestSrvFile(deps, file, ctx));
  return results;
}

/** One SRV file: accepted, skipped when every SRV in it is older than the stored one, or failed with a reason. */
export async function ingestSrvFile(
  deps: SrvIngestDeps,
  file: UploadFile,
  ctx: IngestContext,
  preStored = false,
): Promise<FileResult> {
  const { name } = file;
  const parsed = parseSrv(file.html);
  if (!parsed.ok) {
    const { code, message } = parsed.error;
    return { name, status: "failed", reason: `Could not read this SRV page (${code}): ${message}` };
  }
  const { srvs: docs, failed } = parsed.value;
  // Every SRV in a file is of one PO (SPEC-06 §4.1), and the page is keyed by it (EC-29).
  const { poNumber } = docs[0];
  const docDate = docs.map((doc) => doc.srvDate).reduce((a, b) => (compareIsoDate(a, b) >= 0 ? a : b));
  if (!preStored) await storeSourceDocument(deps, { kind: "srv", key: poNumber, html: file.html, docDate }, ctx);

  const stored = new Map((await srvsOfPoNumber(deps.db, ctx.supplierId, poNumber)).map((r) => [r.srvNumber, r]));
  const { accepted, skipped } = byDate(docs, stored);
  const unread = failed.map(
    ({ srvNumber, error }) => `SRV ${srvNumber} could not be read (${error.code}): ${error.message}.`,
  );
  if (accepted.length === 0) {
    return { name, status: "skipped", reason: [`${olderThan(skipped)}. Nothing was changed.`, ...unread].join(" ") };
  }

  const poId = (await findPoByNumber(deps.db, ctx.supplierId, poNumber))?.id ?? null;
  const batch = new WriteBatch(deps.db);
  for (const statement of await ingestStatements(deps, accepted, stored, poId, ctx)) batch.add(statement);
  try {
    await batch.commit();
  } catch (err) {
    if (!(err instanceof DbError)) throw err;
    const reason = `The SRVs of PO ${poNumber} could not be saved. Nothing from this file was changed.`;
    return { name, status: "failed", reason };
  }
  const were = skipped.length === 1 ? "it was" : "they were";
  const notes = [
    poId !== null ? null : `PO ${poNumber} is not in the system yet; its SRVs are stored and listed as "PO not found".`,
    skipped.length === 0 ? null : `${olderThan(skipped)}, so ${were} skipped.`,
    ...unread,
  ].filter((note) => note !== null);
  return { name, status: "accepted", reason: notes.length > 0 ? notes.join(" ") : null };
}

/** The SRVs of a file that replace or add to the stored ones, and the stored ones that older copies lost to. */
function byDate(docs: readonly SrvDocument[], stored: ReadonlyMap<string, StoredSrv>) {
  const accepted: SrvDocument[] = [];
  const skipped: StoredSrv[] = [];
  for (const doc of docs) {
    const old = stored.get(doc.srvNumber);
    if (old && !acceptIncoming(old.srvDate, doc.srvDate)) skipped.push(old);
    else accepted.push(doc);
  }
  return { accepted, skipped };
}

/** "Older than the stored SRV 1 (dated …)" for the stored SRVs a file's older copies lost to. */
function olderThan(skipped: readonly StoredSrv[]): string {
  const list = skipped.map((s) => `${s.srvNumber} (dated ${s.srvDate})`).join(", ");
  return `Older than the stored SRV${skipped.length === 1 ? "" : "s"} ${list}`;
}

/** `poId` is the stored PO's, or `null` when the PO is not in the system (INV-40). */
async function ingestStatements(
  deps: SrvIngestDeps,
  accepted: readonly SrvDocument[],
  stored: ReadonlyMap<string, StoredSrv>,
  poId: string | null,
  ctx: IngestContext,
): Promise<Statement[]> {
  const { db } = deps;
  const replacedIds = accepted.flatMap((doc) => stored.get(doc.srvNumber)?.id ?? []);
  const [snapshot, oldItems, dcs, invoices] = await Promise.all([
    poId === null ? undefined : loadPoSnapshot(db, poId),
    replacedIds.length === 0 ? [] : srvItemKeysOf(db, replacedIds),
    dcNumbersOf(db, ctx.supplierId),
    invoiceNumbersOf(db, ctx.supplierId),
  ]);
  const refs = { dcs, invoices, items: snapshot?.items, idOf: idsByKey(oldItems) };
  const now = deps.clock.now();
  const statements: Statement[] = [];
  const newLines: SrvLine[] = [];
  for (const doc of accepted) {
    const before = stored.get(doc.srvNumber);
    const srvId = before?.id ?? newId();
    const items = occurrenceKeys(doc.items.map((item) => ({ ...item, srvId }))).map(([item, key]) =>
      srvItemRow(item, { id: refs.idOf.get(key), srvId, srvDate: doc.srvDate, refs }),
    );
    newLines.push(...items.map(({ line }) => line));
    const header = {
      srvDate: doc.srvDate,
      financialYear: fyOf(doc.srvDate),
      rawHeader: doc.rawHeader,
      poId,
    };
    if (before) statements.push(db.build.delete(srvItem).where(eq(srvItem.srvId, srvId)));
    statements.push(
      db.build
        .insert(srv)
        .values({ ...header, id: srvId, supplierId: ctx.supplierId, poNumber: doc.poNumber, srvNumber: doc.srvNumber })
        .onConflictDoUpdate({ target: [srv.supplierId, srv.poNumber, srv.srvNumber], set: header }),
      ...insertRows(
        db,
        srvItem,
        items.map(({ row }) => ({ ...row, supplierId: ctx.supplierId })),
      ),
      insertAudit(db, {
        id: newId(),
        at: now,
        actor: ctx.actor,
        action: "srv.ingest",
        entityType: "srv",
        entityId: srvId,
        before: before ? { srvDate: before.srvDate } : null,
        after: { poNumber: doc.poNumber, srvNumber: doc.srvNumber, srvDate: doc.srvDate, items: items.length },
        jobId: ctx.jobId,
      }),
    );
  }
  if (snapshot) {
    const replaced = new Set(replacedIds);
    const srvLines = [...snapshot.srvLines.filter((line) => !replaced.has(line.srvId)), ...newLines];
    statements.push(...recomputeStatements(deps, { ...snapshot, srvLines }));
  }
  return statements;
}

type DocItem = SrvDocument["items"][number];
type ItemKey = Pick<DocItem, "poItemNo" | "lotNo" | "srvItemNo">;

/**
 * Each row with its key: its SRV, the page's own key, and its occurrence among the SRV's rows that repeat that key
 * (A2-10), so a re-uploaded SRV's rows keep the ids their flags cite (INV-59). `rows` are in row order.
 */
function occurrenceKeys<R extends ItemKey & { srvId: string }>(rows: readonly R[]): [R, string][] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = `${row.srvId}/${row.poItemNo}/${row.lotNo ?? ""}/${row.srvItemNo}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return [row, `${key}#${n}`];
  });
}

/** The stored items' ids by `occurrenceKeys`; `rows` are in row order within each SRV. */
const idsByKey = (rows: readonly (ItemKey & { id: string; srvId: string })[]): Map<string, string> =>
  new Map(occurrenceKeys(rows).map(([row, key]) => [key, row.id]));

interface ItemRefs {
  readonly dcs: Awaited<ReturnType<typeof dcNumbersOf>>;
  readonly invoices: Awaited<ReturnType<typeof invoiceNumbersOf>>;
  /** The PO's items, or `undefined` when the PO is not stored: its SRV items stay unmatched (INV-40). */
  readonly items: PoSnapshot["items"] | undefined;
  /** The ids of the replaced SRV's items by key, so the flags that cite them still apply (INV-59). */
  readonly idOf: ReadonlyMap<string, string>;
}

/** An SRV item's row, every column as on the page, and the line recompute reads from it. `id`: the replaced row's. */
function srvItemRow(
  item: DocItem,
  { id, srvId, srvDate, refs }: { id: string | undefined; srvId: string; srvDate: IsoDate; refs: ItemRefs },
) {
  const line = {
    id: id ?? newId(),
    srvId,
    poItemNo: item.poItemNo,
    srvItemNo: item.srvItemNo,
    poItemId: refs.items ? matchSrvItem(item, refs.items) : null,
    srvDate,
    // A page without ORD QTY stores 0, as legacy (EC-31).
    ordQty: item.ordQty ?? ZERO,
    rcdQty: item.rcdQty,
    acceptedQty: item.acceptedQty,
    rejQty: item.rejQty,
    challanNo: item.challanNo,
    invoiceNo: item.invoiceNo,
    resolvedDcId: resolveDocLink(item.challanNo, srvDate, refs.dcs),
    resolvedInvoiceId: resolveDocLink(item.invoiceNo, srvDate, refs.invoices),
  } satisfies SrvLine;
  const { srvDate: _date, ...stored } = line;
  const row = { ...item, ...stored };
  return { line, row };
}
