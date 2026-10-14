// SRV file ingest (SPEC-08 §4.2, ARCHITECTURE §6.10, §7.2, §7.3): parse outside any batch (a duplicate item key fails
// the file, INV-50), keep the raw page, then one `WriteBatch` per file: for each SRV not older than the stored one
// (INV-43), replace its row and items, matching items (INV-39), keeping the cited numbers as text (INV-38) and resolving
// them in the SRV date's FY (INV-37) → recompute the PO and its new flags (INV-52, INV-53) → audit. An SRV whose PO is
// not stored is kept unattached and changes nothing (INV-40).
import type { Statement } from "@senstosales/db";
import { DbError, srv, srvItem, WriteBatch } from "@senstosales/db";
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
export async function ingestSrvFile(deps: SrvIngestDeps, file: UploadFile, ctx: IngestContext): Promise<FileResult> {
  const { name } = file;
  const parsed = parseSrv(file.html);
  if (!parsed.ok) {
    const { code, message } = parsed.error;
    return { name, status: "failed", reason: `Could not read this SRV page (${code}): ${message}` };
  }
  const docs = parsed.value;
  // Every SRV in a file is of one PO (SPEC-06 §4.1), and the page is keyed by it (EC-29).
  const poNumber = docs[0]?.poNumber ?? "";
  const docDate = docs.map((doc) => doc.srvDate).reduce((a, b) => (compareIsoDate(a, b) >= 0 ? a : b));
  await storeSourceDocument(deps, { kind: "srv", key: poNumber, html: file.html, docDate }, ctx);

  const stored = new Map((await srvsOfPoNumber(deps.db, ctx.supplierId, poNumber)).map((r) => [r.srvNumber, r]));
  const isNewer = (doc: SrvDocument) => acceptIncoming(stored.get(doc.srvNumber)?.srvDate ?? null, doc.srvDate);
  const accepted = docs.filter(isNewer);
  const skipped = docs.filter((doc) => !isNewer(doc)).map((doc) => stored.get(doc.srvNumber));
  if (accepted.length === 0) return { name, status: "skipped", reason: `${olderThan(skipped)}. Nothing was changed.` };

  const target = await findPoByNumber(deps.db, ctx.supplierId, poNumber);
  const batch = new WriteBatch(deps.db);
  for (const statement of await ingestStatements(deps, { accepted, stored, poId: target?.id, ctx })) {
    batch.add(statement);
  }
  try {
    await batch.commit();
  } catch (err) {
    if (!(err instanceof DbError)) throw err;
    const reason = `The SRVs of PO ${poNumber} could not be saved. Nothing from this file was changed.`;
    return { name, status: "failed", reason };
  }
  const notes = [
    target ? null : `PO ${poNumber} is not in the system yet; its SRVs are stored and listed as "PO not found".`,
    skipped.length === 0 ? null : `${olderThan(skipped)}, so ${skipped.length === 1 ? "it was" : "they were"} skipped.`,
  ].filter((note) => note !== null);
  return { name, status: "accepted", reason: notes.length > 0 ? notes.join(" ") : null };
}

/** "Older than the stored SRV 1 (dated …)" for the stored SRVs a file's older copies lost to. */
function olderThan(skipped: readonly (StoredSrv | undefined)[]): string {
  const list = skipped.flatMap((s) => (s ? [`${s.srvNumber} (dated ${s.srvDate})`] : [])).join(", ");
  return `Older than the stored SRV${skipped.length === 1 ? "" : "s"} ${list}`;
}

interface IngestInput {
  readonly accepted: readonly SrvDocument[];
  readonly stored: ReadonlyMap<string, StoredSrv>;
  /** The stored PO's id; `undefined` when the PO is not in the system (INV-40). */
  readonly poId: string | undefined;
  readonly ctx: IngestContext;
}

async function ingestStatements(deps: SrvIngestDeps, input: IngestInput): Promise<Statement[]> {
  const { db } = deps;
  const { accepted, stored, poId, ctx } = input;
  const snapshot = poId === undefined ? undefined : await loadPoSnapshot(db, poId);
  const replacedIds = accepted.flatMap((doc) => stored.get(doc.srvNumber)?.id ?? []);
  const oldIds = replacedIds.length === 0 ? [] : await srvItemKeysOf(db, replacedIds);
  const refs = {
    dcs: await dcNumbersOf(db, ctx.supplierId),
    invoices: await invoiceNumbersOf(db, ctx.supplierId),
    items: snapshot?.items,
    idOf: new Map(oldIds.map((row) => [itemKey(row.srvId, row), row.id])),
  };
  const now = deps.clock.now();
  const statements: Statement[] = [];
  const newLines: SrvLine[] = [];
  for (const doc of accepted) {
    const before = stored.get(doc.srvNumber);
    const srvId = before?.id ?? newId();
    const items = doc.items.map((item) => srvItemRow(item, { srvId, srvDate: doc.srvDate, refs }));
    newLines.push(...items.map(({ line }) => line));
    const header = {
      srvDate: doc.srvDate,
      financialYear: fyOf(doc.srvDate),
      rawHeader: doc.rawHeader,
      poId: poId ?? null,
    };
    statements.push(
      db.build.delete(srvItem).where(eq(srvItem.srvId, srvId)),
      db.build
        .insert(srv)
        .values({ ...header, id: srvId, supplierId: ctx.supplierId, poNumber: doc.poNumber, srvNumber: doc.srvNumber })
        .onConflictDoUpdate({ target: [srv.supplierId, srv.poNumber, srv.srvNumber], set: header }),
      db.build.insert(srvItem).values(items.map(({ row }) => ({ ...row, supplierId: ctx.supplierId }))),
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

const itemKey = (srvId: string, { poItemNo, lotNo, srvItemNo }: ItemKey) =>
  `${srvId}/${poItemNo}/${lotNo}/${srvItemNo}`;

interface ItemRefs {
  readonly dcs: Awaited<ReturnType<typeof dcNumbersOf>>;
  readonly invoices: Awaited<ReturnType<typeof invoiceNumbersOf>>;
  /** The PO's items, or `undefined` when the PO is not stored: its SRV items stay unmatched (INV-40). */
  readonly items: PoSnapshot["items"] | undefined;
  /** The ids of the replaced SRV's items by key, so the flags that cite them still apply (INV-59). */
  readonly idOf: ReadonlyMap<string, string>;
}

/** An SRV item's row and the line recompute reads from it. */
function srvItemRow(item: DocItem, { srvId, srvDate, refs }: { srvId: string; srvDate: IsoDate; refs: ItemRefs }) {
  const line = {
    id: refs.idOf.get(itemKey(srvId, item)) ?? newId(),
    srvId,
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
  const row = {
    ...stored,
    materialCode: item.materialCode,
    poItemNo: item.poItemNo,
    lotNo: item.lotNo,
    srvItemNo: item.srvItemNo,
    challanDate: item.challanDate,
    invoiceDate: item.invoiceDate,
  };
  return { line, row };
}
