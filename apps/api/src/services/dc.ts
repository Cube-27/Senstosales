// Delivery challans (SPEC-11 §2, §4.2): the create form's dispatchable items, create, header edit, delete, list,
// stats and detail. No quantity blocks a save (C6, A-7): the only rejections are malformed lines (400), an unknown PO
// or DC (404), a DC or GC number taken in the FY, a stale version and a blocked delete (409). Each write is one
// batch: the version guards, the DC rows, the SRV links to its numbers, the recompute of every PO whose rows or flags
// change, and the audit row (C4).
import { dc, dcItem, insertRows, updateWithVersion } from "@senstosales/db";
import type { DeleteBlockReason, Money, Qty } from "@senstosales/domain";
import {
  compareIsoDate,
  dcListTotals,
  defaultGc,
  deleteBlock,
  fyOf,
  sumMoney,
  sumQty,
  validateDcLines,
} from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { ConflictError, dcNotFound, fieldError, linesError } from "../errors.ts";
import { newId } from "../ids.ts";
import type { DcFilters } from "../repositories/dc.ts";
import {
  dcListLines,
  dcsNumbered,
  deleteLinksOfDc,
  findDc,
  findDcWithPo,
  invoicesOfDcs,
  isNumberCollision,
  itemsOfDc,
  openFlagCountsOfDcs,
  openFlagsOfDc,
  srvsOfDc,
  stillUnlinked,
} from "../repositories/dc.ts";
import { itemsOfPo } from "../repositories/po-list.ts";
import { findSupplier, supplierSnapshotOf } from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import { commit, docWrites, loadPo, NO_LINKS } from "./doc-writes.ts";
import type { SupplierDeps } from "./index.ts";
import type { Comparator } from "./paging.ts";
import { byNum, byNumber, byText, desc, inValueRange, on, page } from "./paging.ts";
import { loadPoSnapshot } from "./recompute.ts";
import { retrying } from "./retry.ts";

export type DcCreate = z.output<(typeof routes)["dc.create"]["body"]>;
type DcUpdate = z.output<(typeof routes)["dc.update"]["body"]>;
type ListQuery = z.output<(typeof routes)["dc.list"]["query"]>;
/** The fields of a create or edit body that name the DC and its GC. */
type Numbered = Pick<DcCreate, "number" | "dcDate" | "gcNumber" | "gcDate">;

/** Header fields the form starts blank; the supplier's own details are filled in. */
const BLANK_HEADER = {
  ourRef: null,
  departmentNo: null,
  consigneeName: null,
  consigneeGstin: null,
  consigneeAddress: null,
  inspectionCompany: null,
  ewayBillNo: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  modeOfTransport: null,
  remarks: null,
  invoiceNumber: null,
  invoiceDate: null,
  lotNo: null,
} satisfies Partial<DcCreate>;

/** The plain reason a DC delete is refused (INV-35). */
const DELETE_BLOCKED: Partial<Record<DeleteBlockReason, string>> = {
  "dc-has-invoice": "This DC has an invoice. Delete the invoice first.",
  "dc-linked-srv": "An SRV is linked to this DC, so it cannot be deleted.",
};

/** A list row: the legacy DC list's totals over the DC's lines. */
type Line = Awaited<ReturnType<typeof dcListLines>>[number];
type Row = Pick<Line, "id" | "number" | "dcDate" | "financialYear" | "poId" | "poNumber"> & {
  ordQty: Qty;
  dspQty: Qty;
  rcdQty: Qty;
  value: Money;
};

/** The DC list's sorts, which its CSV export keeps. */
export const DC_LIST_SORTS: Record<
  NonNullable<ListQuery["sort"]>,
  Comparator<Pick<Row, "number" | "dcDate" | "poNumber" | "ordQty" | "dspQty" | "rcdQty" | "value">>
> = {
  number: on((r) => r.number, byNumber),
  dcDate: on((r) => r.dcDate, compareIsoDate),
  poNumber: on((r) => r.poNumber, byNumber),
  ordQty: on((r) => r.ordQty, byNum),
  dspQty: on((r) => r.dspQty, byNum),
  rcdQty: on((r) => r.rcdQty, byNum),
  value: on((r) => r.value, byNum),
};

/** Newest first, as the legacy list opens; also the tie-break of every sort, so pages are stable. */
const DEFAULT = [desc(DC_LIST_SORTS.dcDate), desc(DC_LIST_SORTS.number), desc(on<Row, string>((r) => r.id, byText))];

/** One row per DC the filters keep, with its list totals; then the value range. */
function toRows(lines: readonly Line[], filters: DcFilters): Row[] {
  return [...Map.groupBy(lines, (line) => line.id).values()]
    .map((group): Row => {
      const { id, number, dcDate, financialYear, poId, poNumber } = group[0]!;
      return { id, number, dcDate, financialYear, poId, poNumber, ...dcListTotals(group) };
    })
    .filter((row) => inValueRange(row.value, filters));
}

export function dcService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  async function loadDc(id: string) {
    const row = await findDcWithPo(db, id);
    if (row === undefined) throw dcNotFound();
    return row;
  }

  const { guardedRecompute, otherPos, relink, numberCheck } = docWrites({ db, clock }, "dc");

  /** One create attempt: reads the PO, then builds and commits the batch. */
  async function createOnce(supplier: string, body: DcCreate, number: string) {
    // The version is read before the snapshot, so a PO changed in between fails the batch (D-0220, INV-95).
    const row = await loadPo(db, body.poId);
    const id = newId();
    const [snapshot, links] = await Promise.all([
      loadPoSnapshot(db, body.poId),
      relink(supplier, id, [number], { id, number, date: body.dcDate }),
    ]);
    const lines = body.items.map((item) => ({ poItemId: item.poItemId, qty: item.dspQty }));
    const issues = validateDcLines({ poItemIds: new Set(snapshot.items.map((i) => i.id)), lines });
    if (issues.length > 0) throw linesError(issues, dcBodyPath);

    const now = clock.now();
    const financialYear = fyOf(body.dcDate);
    const gc = gcOf(body, number);
    const { items, ...fields } = body;
    const { poId } = fields;
    const dcRow = { ...fields, ...gc, id, supplierId: supplier, number, financialYear, createdAt: now };
    const itemRows = items.map((item) => ({ id: newId(), supplierId: supplier, dcId: id, ...item, createdAt: now }));

    await commit(db, [
      db.build.insert(dc).values(dcRow),
      ...insertRows(db, dcItem, itemRows),
      ...links.statements,
      // A DC is a user change to the PO's quantities: an edit or create built from the PO before it fails (D-0220).
      ...guardedRecompute({ ...snapshot, dcLines: [...snapshot.dcLines, ...itemRows] }, row.version, links.changes),
      audit(db, now, {
        action: "dc.create",
        entityType: "dc",
        entityId: id,
        after: { poId, number, dcDate: body.dcDate, financialYear, ...gc, items },
      }),
    ]);
    return id;
  }

  /**
   * One edit attempt. Only header fields are written, so the lines stay as saved (INV-33, D-0098). The SRV items
   * citing the old or the new number are linked again (INV-25, INV-37), and every PO whose SRV items change link is
   * recomputed for its flags.
   */
  async function updateOnce(supplier: string, id: string, { version, ...body }: DcUpdate, number: string) {
    const { dc: stored, poVersion } = await loadDc(id);
    const fields = { ...body, number, financialYear: fyOf(body.dcDate), ...gcOf(body, number) };
    // Links resolve by (number, FY) (INV-24): with both unchanged, no citation resolves differently.
    const moved = number !== stored.number || fields.financialYear !== stored.financialYear;
    const [snapshot, links] = await Promise.all([
      loadPoSnapshot(db, stored.poId),
      moved ? relink(supplier, id, [stored.number, number], { id, number, date: body.dcDate }) : NO_LINKS,
    ]);
    const recompute = [
      ...guardedRecompute(snapshot, poVersion, links.changes),
      ...(await otherPos(links.poIds, stored.poId, links.changes)),
    ];
    const { id: _id, poId: _poId, createdAt: _createdAt, version: _version, ...before } = stored;

    await commit(db, [
      // First, so a stale version is reported as the DC's (INV-95), not retried as the PO's.
      updateWithVersion(db, dc, id, version, fields),
      ...links.statements,
      // A DC edit is a user change of the PO's documents: a delete or edit committed after the read fails this batch.
      ...recompute,
      audit(db, clock.now(), {
        action: "dc.update",
        entityType: "dc",
        entityId: id,
        before: { ...before, version },
        after: { ...fields, version: version + 1 },
      }),
    ]);
  }

  /** One delete attempt: refused while an invoice or an SRV item links the DC (INV-35). */
  async function deleteOnce(supplier: string, id: string) {
    const { dc: row, poVersion } = await loadDc(id);
    const reason = deleteBlock("dc", await deleteLinksOfDc(db, id));
    if (reason !== null) throw new ConflictError("delete-blocked", DELETE_BLOCKED[reason]!, { reason });

    const [snapshot, links] = await Promise.all([
      loadPoSnapshot(db, row.poId),
      relink(supplier, id, [row.number], null),
    ]);
    const lines = snapshot.dcLines.filter((line) => line.dcId === id);
    const kept = snapshot.dcLines.filter((line) => line.dcId !== id);
    const recompute = guardedRecompute({ ...snapshot, dcLines: kept }, poVersion, links.changes);
    const { poId, number, dcDate, financialYear, gcNumber, gcDate, version } = row;

    await commit(db, [
      stillUnlinked(db, id),
      db.build.delete(dcItem).where(eq(dcItem.dcId, id)),
      db.build.delete(dc).where(eq(dc.id, id)),
      ...links.statements,
      ...recompute,
      audit(db, clock.now(), {
        action: "dc.delete",
        entityType: "dc",
        entityId: id,
        before: {
          poId,
          number,
          dcDate,
          financialYear,
          gcNumber,
          gcDate,
          version,
          items: lines.map((line) => ({ poItemId: line.poItemId, dspQty: line.dspQty })),
        },
      }),
    ]);
  }

  /**
   * The 409 naming the number and the FY it is taken in (SPEC-11 §4.2). When the DC and GC numbers both collide, the
   * database names only one index, so the stored DCs decide, and a taken DC number is the one named. `self` is the
   * DC being edited, which never collides with itself.
   */
  async function numberTaken(supplier: string, body: Numbered, number: string, self: string | undefined) {
    const fy = fyOf(body.dcDate);
    const taken = (await dcsNumbered(db, supplier, [number])).some((d) => d.id !== self && fyOf(d.date) === fy);
    if (taken) return new ConflictError("dc-number-taken", `DC ${number} already exists in FY ${fy}.`);
    return new ConflictError("gc-number-taken", `GC ${gcOf(body, number).gcNumber} already exists in FY ${fy}.`);
  }

  /**
   * Saves `body` as DC `self` (an edit) or a new DC, by `attempt` with the trimmed number, retried on a stale PO; a
   * DC or GC number taken in the FY is the 409 naming it. Numbers are looked up trimmed (INV-24), so they are stored
   * trimmed: " 7 " and "7" are one DC number (D-0248).
   */
  async function saveNumbered<T>(
    body: Numbered,
    self: string | undefined,
    attempt: (supplier: string, number: string) => Promise<T>,
  ): Promise<T> {
    const supplier = await supplierId.require();
    const number = body.number.trim();
    if (number === "") throw fieldError("number-blank", "number", "Enter the DC number.");
    try {
      return await retrying(["po"], () => attempt(supplier, number));
    } catch (err) {
      throw isNumberCollision(err) ? await numberTaken(supplier, body, number, self) : err;
    }
  }

  async function rows(filters: DcFilters) {
    return toRows(await dcListLines(db, filters), filters);
  }

  return {
    /** The create form: the PO, header defaults and the PO's items with their balances (no cap, INV-32). */
    async dispatchable(poId: string) {
      const [row, items, supplier] = await Promise.all([loadPo(db, poId), itemsOfPo(db, poId), findSupplier(db)]);
      const defaults = { ...BLANK_HEADER, ...supplierSnapshotOf(supplier) };
      return { po: { id: row.id, poNumber: row.poNumber, isGemc: row.isGemc }, defaults, items };
    },

    /** INV-32, INV-26, INV-22: stores the DC in its date's FY, or answers 400, 404 or 409 and writes nothing. */
    async create(body: DcCreate) {
      const id = await saveNumbered(body, undefined, (supplier, number) => createOnce(supplier, body, number));
      return (await findDc(db, id))!;
    },

    /** INV-33, INV-25, INV-26, INV-95: changes header fields only, or answers 400, 404 or 409 and writes nothing. */
    async update(id: string, body: DcUpdate) {
      await saveNumbered(body, id, (supplier, number) => updateOnce(supplier, id, body, number));
      return (await findDc(db, id))!;
    },

    /**
     * INV-35: removes the DC and its lines, or answers 404 or 409 and writes nothing. A link that appears after the
     * read fails the batch (`stillUnlinked`), and the retry reads it and refuses.
     */
    async delete(id: string) {
      const supplier = await supplierId.require();
      await retrying(["po", "dc"], () => deleteOnce(supplier, id));
      return { ok: true as const };
    },

    numberCheck: async (query: Parameters<typeof numberCheck>[1]) => numberCheck(await supplierId.require(), query),

    list: async (query: ListQuery) => {
      const { items, total } = page(await rows(query), query, DC_LIST_SORTS, DEFAULT);
      const ids = items.map((row) => row.id);
      const [invoices, flagCounts] = await Promise.all([invoicesOfDcs(db, ids), openFlagCountsOfDcs(db, ids)]);
      return {
        items: items.map((row) => ({
          ...row,
          invoice: invoices.get(row.id) ?? null,
          openFlagCount: flagCounts.get(row.id) ?? 0,
        })),
        total,
      };
    },

    /** The legacy KPI cards over the DCs the list filters keep. */
    async stats(filters: DcFilters) {
      const all = await rows(filters);
      const sum = (key: "dspQty" | "rcdQty") => sumQty(all.map((row) => row[key]));
      return {
        count: all.length,
        dspQty: sum("dspQty"),
        value: sumMoney(all.map((row) => row.value)),
        rcdQty: sum("rcdQty"),
      };
    },

    async detail(id: string) {
      const { dc: row, po: poRef } = await loadDc(id);
      const [items, invoices, srvs, flags] = await Promise.all([
        itemsOfDc(db, id),
        invoicesOfDcs(db, [id]),
        srvsOfDc(db, id),
        openFlagsOfDc(db, id),
      ]);
      return { dc: row, po: poRef, items, invoice: invoices.get(id) ?? null, srvs, flags };
    },
  };
}

export type DcService = ReturnType<typeof dcService>;

/** INV-26: the GC number and date, trimmed like the DC number; blank ones take the DC's. */
const gcOf = (body: Omit<Numbered, "number">, number: string) =>
  defaultGc({ dcNumber: number, dcDate: body.dcDate, gcNumber: body.gcNumber?.trim() ?? null, gcDate: body.gcDate });

/** A DC line issue's path in the create body: `lines.N.qty` is `items.N.dspQty` (D-0250). */
const dcBodyPath = (path: string) => path.replace(/^lines/, "items").replace(/\.qty$/, ".dspQty");
