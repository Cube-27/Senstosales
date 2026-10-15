// PO list, stats and detail (SPEC-10 §2). Quantities, status and flags are the stored derived columns; the one value
// not stored, a PO's uninvoiced total, comes from the domain (C2). Manual create and edit store the legacy form
// through PO ingest; delete is refused while documents exist (INV-35). Each write is one batch with its audit row.
import type { Statement } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";
import type { DeleteBlockReason } from "@senstosales/domain";
import { deleteBlock, poUninvoicedQty } from "@senstosales/domain";

import { ConflictError, fieldError, NotFoundError } from "../errors.ts";
import { deletePoStatements, hasPoPage, isDuplicatePoNumber } from "../repositories/po.ts";
import type { PoFilters } from "../repositories/po-list.ts";
import {
  findPoRow,
  itemsOfPo,
  itemUninvoicedOf,
  linkedDocsOfPo,
  listPos,
  lotsOfPo,
  openFlagsOfPo,
  poStats,
} from "../repositories/po-list.ts";
import type { AuditEntry } from "./audit.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";
import type { Kept, PoForm } from "./po-form.ts";
import { checkForm, formAudit, formValues, NOTHING_KEPT } from "./po-form.ts";
import type { StoredPo } from "./po-ingest.ts";
import { storePoStatements } from "./po-ingest.ts";

/** The plain reason a PO delete is refused (INV-35). */
const DELETE_BLOCKED: Partial<Record<DeleteBlockReason, string>> = {
  "po-has-dc": "This PO has delivery challans. Delete them first.",
  "po-has-invoice": "This PO has invoices. Delete them first.",
};

export function poService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  async function load(id: string) {
    const row = await findPoRow(db, id);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    return row;
  }

  /** Commits one write batch; a duplicate PO number is a 409. A stale version is one too, in `onError` (INV-95). */
  async function commit(statements: readonly Statement[], poNumber: string): Promise<void> {
    const batch = new WriteBatch(db);
    for (const statement of statements) batch.add(statement);
    try {
      await batch.commit();
    } catch (err) {
      throw isDuplicatePoNumber(err) ? new ConflictError("po-exists", `PO ${poNumber} is already stored.`) : err;
    }
  }

  /** Stores the form as the PO `stored`, or as a new PO, with its audit row, and returns the stored PO. */
  async function save(
    form: PoForm,
    kept: Kept,
    stored: StoredPo | undefined,
    entry: (poId: string) => Omit<AuditEntry, "entityType">,
  ) {
    const now = clock.now();
    const values = formValues(form, checkForm(form), kept);
    const ctx = { supplierId: await supplierId.require(), now };
    const { poId, statements } = await storePoStatements({ db, clock }, values, stored, ctx);
    await commit([...statements, audit(db, now, { ...entry(poId), entityType: "po" })], form.poNumber);
    return load(poId);
  }

  return {
    async list(query: Parameters<typeof listPos>[1]) {
      const page = await listPos(db, query);
      const items = await itemUninvoicedOf(
        db,
        page.items.map((row) => row.id),
      );
      const byPo = Map.groupBy(items, (item) => item.poId);
      const uninvoicedQty = (poId: string) =>
        poUninvoicedQty(
          (byPo.get(poId) ?? []).map((item) => ({
            uninvoicedQty: item.uninvoicedQty,
            cancelled: item.cancelledAt !== null,
          })),
        );
      return { ...page, items: page.items.map((row) => ({ ...row, uninvoicedQty: uninvoicedQty(row.id) })) };
    },

    stats: (filters: PoFilters) => poStats(db, filters),

    async detail(id: string) {
      const [po, items, lots, linked, flags] = await Promise.all([
        load(id),
        itemsOfPo(db, id),
        lotsOfPo(db, id),
        linkedDocsOfPo(db, id),
        openFlagsOfPo(db, id),
      ]);
      const lotsOf = Map.groupBy(lots, (lot) => lot.poItemId);
      return { po, items: items.map((item) => ({ ...item, lots: lotsOf.get(item.id) ?? [] })), linked, flags };
    },

    async linked(id: string) {
      const [, linked] = await Promise.all([load(id), linkedDocsOfPo(db, id)]);
      return linked;
    },

    async create(form: PoForm) {
      return save(form, NOTHING_KEPT, undefined, (poId) => ({
        action: "po.create",
        entityId: poId,
        after: formAudit(form),
      }));
    },

    /** The form sends the version it read; a stale one changes nothing (INV-95). */
    async update(id: string, { version, ...form }: PoForm & { version: number }) {
      // The PO number cannot change (checked below), so the form's names the stored page.
      const [row, items, lots, fromPage] = await Promise.all([
        load(id),
        itemsOfPo(db, id),
        lotsOfPo(db, id),
        supplierId.require().then((supplier) => hasPoPage(db, supplier, form.poNumber)),
      ]);
      // As legacy: the PO number is the PO's identity; a different one is a different PO.
      if (form.poNumber !== row.poNumber) {
        throw fieldError("po-number-changed", "poNumber", "The PO number cannot be changed.");
      }
      const stored = { id, poDate: row.poDate, amendNo: row.amendNo, version };
      return save(form, { header: { ...row, fromPage }, items, lots }, stored, () => ({
        action: "po.update",
        entityId: id,
        before: { ...formAudit({ ...row, items }), version },
        after: { ...formAudit(form), version: version + 1 },
      }));
    },

    /** Refused while any DC or invoice exists on the PO (INV-35); otherwise one batch with its audit row. */
    async delete(id: string): Promise<void> {
      const [row, linked] = await Promise.all([load(id), linkedDocsOfPo(db, id)]);
      const reason = deleteBlock("po", { dcs: linked.dcs.length, invoices: linked.invoices.length });
      if (reason !== null) throw new ConflictError("delete-blocked", DELETE_BLOCKED[reason]!, { reason });
      const before = { poNumber: row.poNumber, poDate: row.poDate, amendNo: row.amendNo, version: row.version };
      const entry = { action: "po.delete", entityType: "po", entityId: id, before };
      await commit([...deletePoStatements(db, id), audit(db, clock.now(), entry)], row.poNumber);
    },
  };
}

export type PoService = ReturnType<typeof poService>;
