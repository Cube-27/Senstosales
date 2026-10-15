// Delivery challans (SPEC-11 §2, §4.2): the create form's dispatchable items, create, header edit, delete, list,
// stats and detail. No quantity blocks a save (C6, A-7): the only rejections are malformed lines (400), an unknown PO
// or DC (404), a DC or GC number taken in the FY, a stale version and a blocked delete (409). Each write is one
// batch: the version guards, the DC rows, the SRV links to its numbers, the recompute of every PO whose rows or flags
// change, and the audit row (C4).
import type { Statement } from "@senstosales/db";
import { ConflictError as StaleVersionError, dc, dcItem, po, updateWithVersion, WriteBatch } from "@senstosales/db";
import type { DeleteBlockReason, Issue, Money, Qty } from "@senstosales/domain";
import {
  compareIsoDate,
  defaultGc,
  deleteBlock,
  fyOf,
  qtyValue,
  sumMoney,
  sumQty,
  validateDcLines,
} from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { ConflictError, fieldError, NotFoundError, ValidationError } from "../errors.ts";
import { newId } from "../ids.ts";
import type { DcFilters } from "../repositories/dc.ts";
import {
  dcListLines,
  dcsNumbered,
  deleteLinksOfDc,
  findDc,
  findDcForWrite,
  invoicesOfDcs,
  isNumberCollision,
  itemsOfDc,
  openFlagCountsOfDcs,
  openFlagsOfDc,
  srvsOfDc,
  stillUnlinked,
} from "../repositories/dc.ts";
import { findPoRow, itemsOfPo } from "../repositories/po-list.ts";
import { findSupplier, supplierSnapshotOf } from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";
import { reresolveLinks } from "./links.ts";
import type { Comparator } from "./paging.ts";
import { byNum, byNumber, byText, desc, on, page } from "./paging.ts";
import type { PoSnapshot } from "./recompute.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";

export type DcCreate = z.output<(typeof routes)["dc.create"]["body"]>;
type DcUpdate = z.output<(typeof routes)["dc.update"]["body"]>;
type ListQuery = z.output<(typeof routes)["dc.list"]["query"]>;

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
} satisfies Partial<DcCreate>;

/** The plain reason a DC delete is refused (INV-35). */
const DELETE_BLOCKED: Partial<Record<DeleteBlockReason, string>> = {
  "dc-has-invoice": "This DC has an invoice. Delete the invoice first.",
  "dc-linked-srv": "An SRV is linked to this DC, so it cannot be deleted.",
};

/**
 * A write whose PO changed between its read and its commit is rebuilt from fresh rows; the guard makes it fail
 * instead of writing derived columns from rows it never saw. A bound keeps a PO that never settles from looping.
 */
const ATTEMPTS = 3;

/** Runs `attempt` again while its batch fails on a stale row of one of `tables`, at most `ATTEMPTS` times. */
async function retrying<T>(tables: readonly string[], attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      const retry = err instanceof StaleVersionError && tables.includes(err.table) && n < ATTEMPTS;
      if (!retry) throw err;
    }
  }
}

/** A list row: the legacy DC list's totals over the DC's lines. */
type Line = Awaited<ReturnType<typeof dcListLines>>[number];
type Row = Pick<Line, "id" | "number" | "dcDate" | "financialYear" | "poId" | "poNumber"> & {
  ordQty: Qty;
  dspQty: Qty;
  rcdQty: Qty;
  value: Money;
};

const SORTS: Record<NonNullable<ListQuery["sort"]>, Comparator<Row>> = {
  number: on((r) => r.number, byNumber),
  dcDate: on((r) => r.dcDate, compareIsoDate),
  poNumber: on((r) => r.poNumber, byNumber),
  ordQty: on((r) => r.ordQty, byNum),
  dspQty: on((r) => r.dspQty, byNum),
  rcdQty: on((r) => r.rcdQty, byNum),
  value: on((r) => r.value, byNum),
};

/** Newest first, as the legacy list opens; also the tie-break of every sort, so pages are stable. */
const DEFAULT = [desc(SORTS.dcDate), desc(SORTS.number), desc(on<Row, string>((r) => r.id, byText))];

/**
 * One row per DC the filters keep, as the legacy list totals it: each line adds its PO item's ordered and received
 * quantities, its dispatched quantity, and dispatched × the PO item's rate. Then the value range.
 */
function toRows(lines: readonly Line[], { valueMin, valueMax }: DcFilters): Row[] {
  return [...Map.groupBy(lines, (line) => line.id).values()]
    .map((group): Row => {
      const { id, number, dcDate, financialYear, poId, poNumber } = group[0]!;
      const sum = (key: "ordQty" | "dspQty" | "rcdQty") => sumQty(group.map((line) => line[key]));
      return {
        id,
        number,
        dcDate,
        financialYear,
        poId,
        poNumber,
        ordQty: sum("ordQty"),
        dspQty: sum("dspQty"),
        rcdQty: sum("rcdQty"),
        value: sumMoney(group.map((line) => qtyValue(line.dspQty, line.rate))),
      };
    })
    .filter(
      (row) => (valueMin === undefined || row.value >= valueMin) && (valueMax === undefined || row.value <= valueMax),
    );
}

export function dcService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  async function loadPo(poId: string) {
    const row = await findPoRow(db, poId);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    return row;
  }

  async function loadDc(id: string) {
    const row = await findDcForWrite(db, id);
    if (row === undefined) throw new NotFoundError("dc-not-found", "This DC was not found.");
    return row;
  }

  /**
   * The PO's version guard and the recompute of its derived columns and flags from `snapshot`, which was read after
   * `version` (D-0220), with this batch's SRV link changes applied.
   */
  function guardedRecompute(snapshot: PoSnapshot, version: number, links: ReadonlyMap<string, string | null>) {
    const srvLines = snapshot.srvLines.map((l) =>
      links.has(l.id) ? { ...l, resolvedDcId: links.get(l.id) ?? null } : l,
    );
    return [
      updateWithVersion(db, po, snapshot.po.id, version, {}),
      ...recomputeStatements({ db, clock }, { ...snapshot, srvLines }),
    ];
  }

  /** The recompute of every other PO with an SRV item whose link changes: its DOC_NUMBER_CONFLICT may change. */
  async function otherPos(poIds: ReadonlySet<string>, own: string, links: ReadonlyMap<string, string | null>) {
    const others = [...poIds].filter((poId) => poId !== own);
    const statements = await Promise.all(
      others.map(async (poId) => {
        const { version } = await loadPo(poId);
        return guardedRecompute(await loadPoSnapshot(db, poId), version, links);
      }),
    );
    return statements.flat();
  }

  const commit = (statements: readonly Statement[]) =>
    statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();

  /** One create attempt: reads the PO, then builds and commits the batch. */
  async function createOnce(supplier: string, body: DcCreate, number: string) {
    // The version is read before the snapshot, so a PO changed in between fails the batch (D-0220, INV-95).
    const row = await loadPo(body.poId);
    const [snapshot, stored] = await Promise.all([loadPoSnapshot(db, body.poId), dcsNumbered(db, supplier, [number])]);
    const lines = body.items.map((item) => ({ poItemId: item.poItemId, qty: item.dspQty }));
    const issues = validateDcLines({ poItemIds: new Set(snapshot.items.map((i) => i.id)), lines });
    if (issues.length > 0) throw linesError(issues);

    const now = clock.now();
    const financialYear = fyOf(body.dcDate);
    const gc = gcOf(body, number);
    const { items, ...fields } = body;
    const { poId } = fields;
    const id = newId();
    const dcRow = { ...fields, ...gc, id, supplierId: supplier, number, financialYear, createdAt: now };
    const itemRows = items.map((item) => ({ id: newId(), supplierId: supplier, dcId: id, ...item, createdAt: now }));

    const links = await reresolveLinks(db, {
      supplierId: supplier,
      kind: "dc",
      numbers: [number],
      docs: [...stored, { id, number, date: body.dcDate }],
    });

    await commit([
      db.build.insert(dc).values(dcRow),
      db.build.insert(dcItem).values(itemRows),
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
    const { poVersion, ...stored } = await loadDc(id);
    const fields = { ...body, number, financialYear: fyOf(body.dcDate), ...gcOf(body, number) };
    const numbers = [...new Set([stored.number, number])];
    const docs = (await dcsNumbered(db, supplier, numbers)).map((d) =>
      d.id === id ? { id, number, date: body.dcDate } : d,
    );
    const links = await reresolveLinks(db, { supplierId: supplier, kind: "dc", numbers, docs });
    const recompute = [
      ...guardedRecompute(await loadPoSnapshot(db, stored.poId), poVersion, links.changes),
      ...(await otherPos(links.poIds, stored.poId, links.changes)),
    ];
    const { id: _id, poId: _poId, createdAt: _createdAt, version: _version, ...before } = stored;

    await commit([
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
    const { poVersion, ...row } = await loadDc(id);
    const reason = deleteBlock("dc", await deleteLinksOfDc(db, id));
    if (reason !== null) throw new ConflictError("delete-blocked", DELETE_BLOCKED[reason]!, { reason });

    const docs = (await dcsNumbered(db, supplier, [row.number])).filter((d) => d.id !== id);
    const links = await reresolveLinks(db, { supplierId: supplier, kind: "dc", numbers: [row.number], docs });
    const snapshot = await loadPoSnapshot(db, row.poId);
    const lines = snapshot.dcLines.filter((line) => line.dcId === id);
    const kept = snapshot.dcLines.filter((line) => line.dcId !== id);
    const recompute = guardedRecompute({ ...snapshot, dcLines: kept }, poVersion, links.changes);
    const { poId, number, dcDate, financialYear, gcNumber, gcDate, version } = row;

    await commit([
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
  async function numberTaken(
    supplier: string,
    doc: { number: string; dcDate: DcCreate["dcDate"]; gcNumber: string },
    self?: string,
  ) {
    const fy = fyOf(doc.dcDate);
    const taken = (await dcsNumbered(db, supplier, [doc.number])).some((d) => d.id !== self && fyOf(d.date) === fy);
    if (taken) return new ConflictError("dc-number-taken", `DC ${doc.number} already exists in FY ${fy}.`);
    return new ConflictError("gc-number-taken", `GC ${doc.gcNumber} already exists in FY ${fy}.`);
  }

  /** Numbers are looked up trimmed (INV-24), so they are stored trimmed: " 7 " and "7" are one DC number (D-0248). */
  function trimmedNumber(raw: string): string {
    const number = raw.trim();
    if (number === "") throw fieldError("number-blank", "number", "Enter the DC number.");
    return number;
  }

  async function rows(filters: DcFilters) {
    return toRows(await dcListLines(db, filters), filters);
  }

  return {
    /** The create form: the PO, header defaults and the PO's items with their balances (no cap, INV-32). */
    async dispatchable(poId: string) {
      const [row, items, supplier] = await Promise.all([loadPo(poId), itemsOfPo(db, poId), findSupplier(db)]);
      const defaults = { ...BLANK_HEADER, ...supplierSnapshotOf(supplier) };
      return { po: { id: row.id, poNumber: row.poNumber, isGemc: row.isGemc }, defaults, items };
    },

    /** INV-32, INV-26, INV-22: stores the DC in its date's FY, or answers 400, 404 or 409 and writes nothing. */
    async create(body: DcCreate) {
      const supplier = await supplierId.require();
      const number = trimmedNumber(body.number);
      try {
        return (await findDc(db, await retrying(["po"], () => createOnce(supplier, body, number))))!;
      } catch (err) {
        if (!isNumberCollision(err)) throw err;
        throw await numberTaken(supplier, { number, dcDate: body.dcDate, gcNumber: gcOf(body, number).gcNumber });
      }
    },

    /** INV-33, INV-25, INV-26, INV-95: changes header fields only, or answers 400, 404 or 409 and writes nothing. */
    async update(id: string, body: DcUpdate) {
      const supplier = await supplierId.require();
      const number = trimmedNumber(body.number);
      try {
        await retrying(["po"], () => updateOnce(supplier, id, body, number));
      } catch (err) {
        if (!isNumberCollision(err)) throw err;
        throw await numberTaken(supplier, { number, dcDate: body.dcDate, gcNumber: gcOf(body, number).gcNumber }, id);
      }
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

    list: async (query: ListQuery) => {
      const { items, total } = page(await rows(query), query, SORTS, DEFAULT);
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
      const { poVersion: _poVersion, ...row } = await loadDc(id);
      const [poRow, items, invoices, srvs, flags] = await Promise.all([
        loadPo(row.poId),
        itemsOfDc(db, id),
        invoicesOfDcs(db, [id]),
        srvsOfDc(db, id),
        openFlagsOfDc(db, id),
      ]);
      const poRef = { id: poRow.id, poNumber: poRow.poNumber, isGemc: poRow.isGemc };
      return { dc: row, po: poRef, items, invoice: invoices.get(id) ?? null, srvs, flags };
    },
  };
}

export type DcService = ReturnType<typeof dcService>;

/** INV-26: the GC number and date, trimmed like the DC number; blank ones take the DC's. */
const gcOf = (body: Pick<DcCreate, "dcDate" | "gcNumber" | "gcDate">, number: string) =>
  defaultGc({ dcNumber: number, dcDate: body.dcDate, gcNumber: body.gcNumber?.trim() ?? null, gcDate: body.gcDate });

/** The 400 for invalid lines: the first issue's code, and every issue at its body path (SPEC-11 §4.3). */
function linesError(issues: readonly Issue[]): ValidationError {
  const path = (p: string) => `body.${p.replace(/^lines/, "items").replace(/\.qty$/, ".dspQty")}`;
  const fields = issues.map((issue) => ({ path: path(issue.path), message: issue.message }));
  return new ValidationError(issues[0]!.code, issues[0]!.message, { fields });
}
