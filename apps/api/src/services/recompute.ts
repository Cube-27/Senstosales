// The one place stored rows become derived columns and flags (SPEC-08 §1, ARCHITECTURE §6.2, §6.3, §6.9, §6.11).
// It returns statements instead of committing them, so every write use case that touches a PO adds them to its own
// batch (INV-14, INV-84). Every value comes from a domain function (C2); this file groups rows by item and hands them over.
import type { Db, Statement } from "@senstosales/db";
import { DbError, po, poItem, reconciliationIssue, WriteBatch } from "@senstosales/db";
import type { IsoDate, PoFlagSnapshot } from "@senstosales/domain";
import {
  computeItemQuantities,
  computePoTotals,
  computeReceipt,
  detectFlags,
  diffFlags,
  itemStatus,
  poStatus,
  sumQty,
} from "@senstosales/domain";
import { eq } from "drizzle-orm";

import { NotFoundError } from "../errors.ts";
import { newId } from "../ids.ts";
import type { Clock } from "../ports/clock.ts";
import type { DocumentResult, JobHandlers } from "../ports/jobs.ts";
import { dcLinesOfPo } from "../repositories/dc.ts";
import { flagFingerprintsOfPo } from "../repositories/flags.ts";
import { invoiceLinesOfPo } from "../repositories/invoice.ts";
import { findPo, poItemsOf } from "../repositories/po.ts";
import { allPoRefs } from "../repositories/po-list.ts";
import { srvLinesOfPo } from "../repositories/srv.ts";
import { audit } from "./audit.ts";

export interface RecomputeDeps {
  readonly db: Db;
  readonly clock: Clock;
}

/**
 * One PO's stored inputs. A batch that also changes the PO's rows (an ingest, a DC) loads this, applies its own
 * changes to it, and passes the result to `recomputeStatements`: reading back inside a batch is impossible (C4).
 */
export interface PoSnapshot {
  readonly po: { readonly id: string; readonly supplierId: string; readonly poDate: IsoDate };
  readonly items: Awaited<ReturnType<typeof poItemsOf>>;
  readonly dcLines: Awaited<ReturnType<typeof dcLinesOfPo>>;
  readonly invoiceLines: Awaited<ReturnType<typeof invoiceLinesOfPo>>;
  readonly srvLines: Awaited<ReturnType<typeof srvLinesOfPo>>;
  readonly storedFlags: readonly { readonly fingerprint: string }[];
}

type Item = PoSnapshot["items"][number];

export async function loadPoSnapshot(db: Db, poId: string): Promise<PoSnapshot> {
  const row = await findPo(db, poId);
  if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
  // Ingest always stores the PO date (SPEC-06 parses it as required); the column is nullable only in the schema.
  if (row.poDate === null) throw new Error(`PO ${poId} has no PO date`);
  return {
    po: { ...row, poDate: row.poDate },
    items: await poItemsOf(db, poId),
    dcLines: await dcLinesOfPo(db, poId),
    invoiceLines: await invoiceLinesOfPo(db, poId),
    srvLines: await srvLinesOfPo(db, poId),
    storedFlags: await flagFingerprintsOfPo(db, poId),
  };
}

/** The statements that bring the PO's derived columns and flags in line with its stored rows. */
export async function recomputePo(deps: RecomputeDeps, poId: string): Promise<Statement[]> {
  return recomputeStatements(deps, await loadPoSnapshot(deps.db, poId));
}

/**
 * The `recompute-all` job (ARCHITECTURE §7.3): every PO, in PO-number order, gets its derived columns and flags
 * rebuilt from its stored rows in its own batch with an audit row. Only a user starts it; never at startup (C9).
 */
export function recomputeAllHandlers(deps: RecomputeDeps): JobHandlers {
  const { db, clock } = deps;
  return {
    "recompute-all": {
      documents: async () => (await allPoRefs(db)).map((ref) => ({ key: ref.id, label: ref.poNumber })),

      async process(poId, _start, jobId): Promise<DocumentResult> {
        try {
          const statements = await recomputePo(deps, poId);
          const entry = { action: "po.recompute", entityType: "po", entityId: poId, jobId };
          await statements
            .reduce((batch, s) => batch.add(s), new WriteBatch(db))
            .add(audit(db, clock.now(), entry))
            .commit();
        } catch (err) {
          if (err instanceof NotFoundError) {
            return { outcome: "skipped", reason: "This PO was deleted after the job started." };
          }
          // A refused statement fails this PO only and the job goes on (SPEC-08 §4.3). The event names the PO.
          if (err instanceof DbError) {
            return { outcome: "failed", reason: "Could not be recomputed. Its stored values were kept." };
          }
          throw err;
        }
        return { outcome: "done" };
      },
    },
  };
}

/**
 * Item quantities and status, PO totals and status, and the flags not stored yet (INV-59). The PO's `version` is
 * left alone: derived columns are not a user edit (INV-95).
 */
export function recomputeStatements({ db, clock }: RecomputeDeps, snapshot: PoSnapshot): Statement[] {
  const derived = snapshot.items.map((item) => deriveItem(item, snapshot));
  const statements: Statement[] = derived.map(({ item, columns }) =>
    db.build.update(poItem).set(columns).where(eq(poItem.id, item.id)),
  );
  const totals = computePoTotals(
    derived.map(({ item, cancelled, columns }) => ({ ...columns, ordQty: item.ordQty, cancelled })),
  );
  const status = poStatus(derived.map(({ columns }) => columns.status));
  statements.push(
    db.build
      .update(po)
      .set({ ...totals, status })
      .where(eq(po.id, snapshot.po.id)),
  );

  const desired = detectFlags({ poId: snapshot.po.id, items: derived.map(flagItem), srvLines: snapshot.srvLines });
  const inserts = diffFlags(desired, snapshot.storedFlags);
  if (inserts.length > 0) {
    const openedAt = clock.now();
    const rows = inserts.map((flag) => ({
      ...flag,
      id: newId(),
      supplierId: snapshot.po.supplierId,
      status: "open" as const,
      openedAt,
    }));
    // Another batch built from the same stored flags may commit the same fingerprint first; the unique index then
    // keeps its row and this batch still commits (INV-59).
    statements.push(
      db.build
        .insert(reconciliationIssue)
        .values(rows)
        .onConflictDoNothing({ target: reconciliationIssue.fingerprint }),
    );
  }
  return statements;
}

/** INV-03..INV-05, INV-07, INV-08, INV-10..INV-13, INV-62, INV-63 for one item. */
function deriveItem(item: Item, snapshot: PoSnapshot) {
  const onItem = <T extends { poItemId: string | null }>(lines: readonly T[]) =>
    lines.filter((line) => line.poItemId === item.id);
  const dcLines = onItem(snapshot.dcLines);
  const invoiceLines = onItem(snapshot.invoiceLines);
  const invoiceQty = (kind: "dc" | "direct") => invoiceLines.filter((l) => l.kind === kind).map((l) => l.qty);
  const cancelled = item.cancelledAt !== null;
  // Every SRV line on the item decides the date winner and is summed (D-0026).
  const receipt = computeReceipt({
    poDate: snapshot.po.poDate,
    poRcdQty: item.poRcdQty,
    poRejQty: item.poRejQty,
    srvLines: onItem(snapshot.srvLines),
  });
  const { dspQty, balanceQty, uninvoicedQty } = computeItemQuantities({
    ordQty: item.ordQty,
    cancelled,
    dcDispatch: dcLines.map((l) => l.dspQty),
    directInvoiceQty: invoiceQty("direct"),
    dcInvoiceQty: invoiceQty("dc"),
    manualDispatchedQty: item.manualDispatchedQty,
    rcdQty: receipt.rcd,
  });
  const status = itemStatus({ ordQty: item.ordQty, dspQty, rcdQty: receipt.rcd, cancelled });
  return {
    item,
    cancelled,
    dcLines,
    invoiceLines,
    /** The item's derived columns. */
    columns: { dspQty, rcdQty: receipt.rcd, rejQty: receipt.rej, balanceQty, uninvoicedQty, status },
  };
}

/** The domain's flag input for one item: its stored rows with the quantities just derived. */
function flagItem({ item, cancelled, dcLines, invoiceLines, columns }: ReturnType<typeof deriveItem>) {
  return {
    id: item.id,
    ordQty: item.ordQty,
    cancelled,
    dspQty: columns.dspQty,
    invoicedQty: sumQty(invoiceLines.map((l) => l.qty)),
    manualDispatchedQty: item.manualDispatchedQty,
    manualSetAt: item.manualSetAt,
    dcLines,
    invoiceLines,
  } satisfies PoFlagSnapshot["items"][number];
}
