// GST invoices (SPEC-11 §2, §4.2): create, header edit, delete, list, stats and detail. A DC-sourced invoice carries exactly the DC's lines at the DC qty and PO rate, else
// 400 and nothing written (INV-29, A-8); a DC has one invoice (INV-28). A PO-direct invoice has lines on items of its
// one PO, each qty > 0 and no cap, at the PO item's rate (INV-30, INV-31). Tax uses the settings' GST rates, copied onto
// the invoice (INV-41, A2-4). A create is one batch: the PO version guard, the invoice and its lines, the SRV links to
// its number, the PO recompute with its flags, and the audit row (C4). An edit changes header fields only (INV-33) and
// moves the invoice to its date's FY (INV-25); a delete is refused while an SRV item links the invoice (INV-35).
import type { Statement } from "@senstosales/db";
import { insertRows, invoice, invoiceItem, updateWithVersion } from "@senstosales/db";
import type { DeleteBlockReason, Money, Qty } from "@senstosales/domain";
import {
  compareIsoDate,
  deleteBlock,
  fyOf,
  invoiceLineTax,
  invoiceTotals,
  sumMoney,
  sumQty,
  validateDcInvoiceLines,
  validateDirectInvoiceLines,
} from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { ConflictError, dcHasInvoice, dcNotFound, fieldError, invoiceNotFound, linesError } from "../errors.ts";
import { newId } from "../ids.ts";
import { findDc } from "../repositories/dc.ts";
import type { InvoiceFilters } from "../repositories/invoice.ts";
import {
  dcLinesToInvoice,
  deleteLinksOfInvoice,
  findInvoice,
  findInvoiceWithPo,
  invoiceCollision,
  invoiceListLines,
  invoiceStillUnlinked,
  itemsOfInvoice,
  openFlagsOfInvoice,
  srvsOfInvoice,
} from "../repositories/invoice.ts";
import { itemsOfPo } from "../repositories/po-list.ts";
import { audit } from "./audit.ts";
import { commit, docWrites, loadPo, NO_LINKS } from "./doc-writes.ts";
import type { SupplierDeps } from "./index.ts";
import type { Comparator } from "./paging.ts";
import { byNum, byNumber, byText, desc, on, page } from "./paging.ts";
import { loadPoSnapshot } from "./recompute.ts";
import { retrying } from "./retry.ts";
import { gstRatesOf } from "./settings.ts";

export type InvoiceCreate = z.output<(typeof routes)["invoice.create"]["body"]>;
type DcInvoiceCreate = Extract<InvoiceCreate, { kind: "dc" }>;
type DirectInvoiceCreate = Extract<InvoiceCreate, { kind: "direct" }>;
type InvoiceUpdate = z.output<(typeof routes)["invoice.update"]["body"]>;
type ListQuery = z.output<(typeof routes)["invoice.list"]["query"]>;

/** A line before tax. */
type Line = { poItemId: string; dcItemId: string | null; qty: Qty; rate: Money };

/**
 * Where an invoice comes from: its PO, its DC if any, and its lines. A PO-direct invoice's lines are checked against
 * the PO's items, which are read with the snapshot after the PO's version, so `lines` runs then.
 */
type Source = { poId: string; dc: { id: string; number: string } | null; lines: () => Promise<Line[]> };

/** The plain reason an invoice delete is refused (INV-35). */
const DELETE_BLOCKED: Partial<Record<DeleteBlockReason, string>> = {
  "invoice-linked-srv": "An SRV is linked to this invoice, so it cannot be deleted.",
};

/** A list row: the legacy invoice list's line count and Σ line qty, and the stored amounts. */
type ListLine = Awaited<ReturnType<typeof invoiceListLines>>[number];
type Row = Omit<ListLine, "qty" | "cgst" | "sgst" | "igst"> & { itemCount: number; qty: Qty; tax: Money };

/** The invoice list's sorts, which its CSV export keeps. */
export const INVOICE_LIST_SORTS: Record<
  NonNullable<ListQuery["sort"]>,
  Comparator<Pick<Row, "number" | "invoiceDate" | "poNumber" | "itemCount" | "qty" | "total">>
> = {
  number: on((r) => r.number, byNumber),
  invoiceDate: on((r) => r.invoiceDate, compareIsoDate),
  poNumber: on((r) => r.poNumber, byNumber),
  itemCount: on((r) => r.itemCount, byNum),
  qty: on((r) => r.qty, byNum),
  total: on((r) => r.total, byNum),
};

/** Newest first, as the DC list opens; also the tie-break of every sort, so pages are stable. */
const DEFAULT = [
  desc(INVOICE_LIST_SORTS.invoiceDate),
  desc(INVOICE_LIST_SORTS.number),
  desc(on<Row, string>((r) => r.id, byText)),
];

/** One row per invoice: its line count, Σ line qty, and the tax as the legacy KPI card sums it (CGST + SGST + IGST). */
const toRows = (lines: readonly ListLine[]): Row[] =>
  [...Map.groupBy(lines, (line) => line.id).values()].map((group) => {
    const { qty: _, cgst, sgst, igst, ...invoiceCols } = group[0]!;
    return {
      ...invoiceCols,
      itemCount: group.length,
      qty: sumQty(group.map((line) => line.qty)),
      tax: sumMoney([cgst, sgst, igst]),
    };
  });

export function invoiceService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  const { guardedRecompute, otherPos, relink, numberCheck } = docWrites({ db, clock }, "invoice");

  /** INV-29: exactly the DC's lines at the DC qty and PO rate, else 400; checked before the PO is read. */
  async function dcSource(body: DcInvoiceCreate): Promise<Source> {
    const [stored, dcLines] = await Promise.all([findDc(db, body.dcId), dcLinesToInvoice(db, body.dcId)]);
    if (stored === undefined) throw dcNotFound();
    const issues = validateDcInvoiceLines({ dcLines, lines: body.lines });
    if (issues.length > 0) throw linesError(issues);
    // The lines equal the DC's (INV-29), so they are built from the DC's in its order.
    const lines = dcLines.map(({ dcItemId, poItemId, qty, poRate }) => ({ poItemId, dcItemId, qty, rate: poRate }));
    return { poId: stored.poId, dc: { id: stored.id, number: stored.number }, lines: () => Promise.resolve(lines) };
  }

  /** INV-30, INV-31: lines on items of the PO, at least one, each qty > 0, at the PO item's rate. */
  const directSource = (body: DirectInvoiceCreate): Source => ({
    poId: body.poId,
    dc: null,
    async lines() {
      const items = await itemsOfPo(db, body.poId);
      const issues = validateDirectInvoiceLines({ poItemIds: new Set(items.map((i) => i.id)), lines: body.lines });
      if (issues.length > 0) throw linesError(issues);
      const rates = new Map(items.map((i) => [i.id, i.rate]));
      return body.lines.map(({ poItemId, qty }) => ({ poItemId, dcItemId: null, qty, rate: rates.get(poItemId)! }));
    },
  });

  /**
   * One attempt: reads the source and its PO, then builds and commits the batch. A retry reads them again, so a DC
   * deleted meanwhile is a 404.
   */
  async function createOnce(supplier: string, body: InvoiceCreate, number: string) {
    const [source, rates] = await Promise.all([
      body.kind === "dc" ? dcSource(body) : directSource(body),
      gstRatesOf(db, supplier),
    ]);
    const { poId, dc } = source;
    // The version is read before the snapshot, so a PO changed in between fails the batch (D-0220, INV-95).
    const row = await loadPo(db, poId);
    const id = newId();
    const [snapshot, links, lines] = await Promise.all([
      loadPoSnapshot(db, poId),
      relink(supplier, id, [number], { id, number, date: body.invoiceDate }),
      source.lines(),
    ]);

    const now = clock.now();
    const financialYear = fyOf(body.invoiceDate);
    const { cgstPct, sgstPct } = rates;
    const itemRows = lines.map((line) => ({
      id: newId(),
      supplierId: supplier,
      invoiceId: id,
      ...line,
      ...invoiceLineTax({ ...line, cgstPct, sgstPct, gemc: row.isGemc }),
    }));
    const totals = invoiceTotals(itemRows);
    const { kind, lines: _, ...header } = body;
    const dcId = dc?.id ?? null;
    const invoiceRow = {
      ...header,
      ...totals,
      id,
      supplierId: supplier,
      poId,
      dcId,
      kind,
      number,
      financialYear,
      cgstPct,
      sgstPct,
      createdAt: now,
    };

    const invoiceLines = itemRows.map((r) => ({ id: r.id, invoiceId: id, poItemId: r.poItemId, qty: r.qty, kind }));

    const statements: Statement[] = [
      db.build.insert(invoice).values(invoiceRow),
      ...insertRows(db, invoiceItem, itemRows),
      ...links.statements,
      // An invoice changes the PO's quantities: an edit or create built from the PO before it fails (D-0220).
      ...guardedRecompute(
        { ...snapshot, invoiceLines: [...snapshot.invoiceLines, ...invoiceLines] },
        row.version,
        links.changes,
      ),
      audit(db, now, {
        action: "invoice.create",
        entityType: "invoice",
        entityId: id,
        after: {
          poId,
          dcId,
          number,
          invoiceDate: body.invoiceDate,
          financialYear,
          cgstPct,
          sgstPct,
          total: totals.total,
          lines: itemRows.map((r) => ({ poItemId: r.poItemId, dcItemId: r.dcItemId, qty: r.qty, rate: r.rate })),
        },
      }),
    ];
    try {
      await commit(db, statements);
    } catch (err) {
      throw collisionError(err, number, financialYear, dc?.number ?? null);
    }
    return id;
  }

  async function loadInvoice(id: string) {
    const row = await findInvoiceWithPo(db, id);
    if (row === undefined) throw invoiceNotFound();
    return row;
  }

  /**
   * One edit attempt. Only header fields are written, so the lines and amounts stay as saved (INV-33, D-0098). The
   * SRV items citing the old or the new number are linked again (INV-25, INV-37), and every PO whose SRV items change
   * link is recomputed for its flags.
   */
  async function updateOnce(supplier: string, id: string, { version, ...body }: InvoiceUpdate, number: string) {
    const { invoice: stored, poVersion } = await loadInvoice(id);
    const fields = { ...body, number, financialYear: fyOf(body.invoiceDate) };
    // Links resolve by (number, FY) (INV-24): with both unchanged, no citation resolves differently.
    const moved = number !== stored.number || fields.financialYear !== stored.financialYear;
    const [snapshot, links] = await Promise.all([
      loadPoSnapshot(db, stored.poId),
      moved ? relink(supplier, id, [stored.number, number], { id, number, date: body.invoiceDate }) : NO_LINKS,
    ]);
    const recompute = [
      ...guardedRecompute(snapshot, poVersion, links.changes),
      ...(await otherPos(links.poIds, stored.poId, links.changes)),
    ];
    const { id: _id, poId: _poId, dcId: _dcId, kind: _kind, createdAt: _createdAt, version: _v, ...before } = stored;

    try {
      await commit(db, [
        // First, so a stale version is reported as the invoice's (INV-95), not retried as the PO's.
        updateWithVersion(db, invoice, id, version, fields),
        ...links.statements,
        // A delete committed after the read bumps the PO's version and fails this batch.
        ...recompute,
        audit(db, clock.now(), {
          action: "invoice.update",
          entityType: "invoice",
          entityId: id,
          before: { ...before, version },
          after: { ...fields, version: version + 1 },
        }),
      ]);
    } catch (err) {
      throw collisionError(err, number, fields.financialYear, null);
    }
  }

  /** One delete attempt: refused while an SRV item links the invoice (INV-35). */
  async function deleteOnce(supplier: string, id: string) {
    const [{ invoice: row, poVersion }, blocking] = await Promise.all([loadInvoice(id), deleteLinksOfInvoice(db, id)]);
    const reason = deleteBlock("invoice", blocking);
    if (reason !== null) throw new ConflictError("delete-blocked", DELETE_BLOCKED[reason]!, { reason });

    const [snapshot, links, lines] = await Promise.all([
      loadPoSnapshot(db, row.poId),
      relink(supplier, id, [row.number], null),
      itemsOfInvoice(db, id),
    ]);
    const kept = snapshot.invoiceLines.filter((line) => line.invoiceId !== id);
    const { poId, dcId, number, invoiceDate, financialYear, total, version } = row;

    await commit(db, [
      invoiceStillUnlinked(db, id),
      db.build.delete(invoiceItem).where(eq(invoiceItem.invoiceId, id)),
      db.build.delete(invoice).where(eq(invoice.id, id)),
      ...links.statements,
      // A delete gives the lines' quantities back to the PO: an edit or create built before it fails (D-0220).
      ...guardedRecompute({ ...snapshot, invoiceLines: kept }, poVersion, links.changes),
      audit(db, clock.now(), {
        action: "invoice.delete",
        entityType: "invoice",
        entityId: id,
        before: {
          poId,
          dcId,
          number,
          invoiceDate,
          financialYear,
          total,
          version,
          lines: lines.map((l) => ({ poItemId: l.poItemId, dcItemId: l.dcItemId, qty: l.qty, rate: l.rate })),
        },
      }),
    ]);
  }

  /** Numbers are looked up trimmed (INV-24), so they are stored trimmed (D-0248); a blank one is a 400. */
  async function numbered<T>(raw: string, attempt: (supplier: string, number: string) => Promise<T>) {
    const supplier = await supplierId.require();
    const number = raw.trim();
    if (number === "") throw fieldError("number-blank", "number", "Enter the invoice number.");
    return retrying(["po"], () => attempt(supplier, number));
  }

  async function rows(filters: InvoiceFilters) {
    return toRows(await invoiceListLines(db, filters));
  }

  return {
    numberCheck: async (query: Parameters<typeof numberCheck>[1]) => numberCheck(await supplierId.require(), query),

    /**
     * INV-28 to INV-31, INV-41: stores the invoice in its date's FY, or answers 400, 404 or 409 and writes nothing.
     */
    async create(body: InvoiceCreate) {
      const id = await numbered(body.number, (supplier, number) => createOnce(supplier, body, number));
      return (await findInvoice(db, id))!;
    },

    /** INV-33, INV-25, INV-95: changes header fields only, or answers 400, 404 or 409 and writes nothing. */
    async update(id: string, body: InvoiceUpdate) {
      await numbered(body.number, (supplier, number) => updateOnce(supplier, id, body, number));
      return (await findInvoice(db, id))!;
    },

    /**
     * INV-35: removes the invoice and its lines, or answers 404 or 409 and writes nothing. A link that appears after
     * the read fails the batch (`invoiceStillUnlinked`), and the retry reads it and refuses.
     */
    async delete(id: string) {
      const supplier = await supplierId.require();
      await retrying(["po", "invoice"], () => deleteOnce(supplier, id));
      return { ok: true as const };
    },

    async list(query: ListQuery) {
      return page(await rows(query), query, INVOICE_LIST_SORTS, DEFAULT);
    },

    /** The legacy KPI cards over the invoices the list filters keep. */
    async stats(filters: InvoiceFilters) {
      const all = await rows(filters);
      const sum = (key: "total" | "taxable" | "tax") => sumMoney(all.map((row) => row[key]));
      return { count: all.length, total: sum("total"), taxable: sum("taxable"), tax: sum("tax") };
    },

    async detail(id: string) {
      const [{ invoice: row, po: poRef, dc }, items, srvs, flags] = await Promise.all([
        loadInvoice(id),
        itemsOfInvoice(db, id),
        srvsOfInvoice(db, id),
        openFlagsOfInvoice(db, id),
      ]);
      return { invoice: row, po: poRef, dc, items, srvs, flags };
    },
  };
}

export type InvoiceService = ReturnType<typeof invoiceService>;

/** SPEC-11 §4.2: a unique index refusal is a 409 naming the number and FY, or the DC; anything else is rethrown. */
function collisionError(err: unknown, number: string, financialYear: string, dcNumber: string | null) {
  const collision = invoiceCollision(err);
  if (collision === "number") {
    return new ConflictError("invoice-number-taken", `Invoice ${number} already exists in FY ${financialYear}.`);
  }
  return collision === "dc" && dcNumber !== null ? dcHasInvoice(dcNumber) : err;
}
