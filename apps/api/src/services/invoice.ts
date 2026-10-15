// GST invoices (SPEC-11 §2, §4.2). A DC-sourced invoice carries exactly the DC's lines at the DC qty and PO rate, else
// 400 and nothing written (INV-29, A-8); a DC has one invoice (INV-28). A PO-direct invoice has lines on items of its
// one PO, each qty > 0 and no cap, at the PO item's rate (INV-30, INV-31). Tax uses the settings' GST rates, copied onto
// the invoice (INV-41, A2-4). A create is one batch: the PO version guard, the invoice and its lines, the SRV links to
// its number, the PO recompute with its flags, and the audit row (C4).
import type { Statement } from "@senstosales/db";
import { invoice, invoiceItem, po, updateWithVersion, WriteBatch } from "@senstosales/db";
import type { Money, Qty } from "@senstosales/domain";
import {
  fyOf,
  invoiceLineTax,
  invoiceTotals,
  validateDcInvoiceLines,
  validateDirectInvoiceLines,
} from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { ConflictError, dcHasInvoice, dcNotFound, fieldError, linesError, NotFoundError } from "../errors.ts";
import { newId } from "../ids.ts";
import { findDc } from "../repositories/dc.ts";
import { dcLinesToInvoice, findInvoice, invoiceCollision, invoicesNumbered } from "../repositories/invoice.ts";
import { findPoRow, itemsOfPo } from "../repositories/po-list.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";
import { reresolveLinks } from "./links.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";
import { retrying } from "./retry.ts";
import { gstRatesOf } from "./settings.ts";

export type InvoiceCreate = z.output<(typeof routes)["invoice.create"]["body"]>;
type DcInvoiceCreate = Extract<InvoiceCreate, { kind: "dc" }>;
type DirectInvoiceCreate = Extract<InvoiceCreate, { kind: "direct" }>;

/** A line before tax. */
type Line = { poItemId: string; dcItemId: string | null; qty: Qty; rate: Money };

/**
 * Where an invoice comes from: its PO, its DC if any, and its lines. A PO-direct invoice's lines are checked against
 * the PO's items, which are read with the snapshot after the PO's version, so `lines` runs then.
 */
type Source = { poId: string; dc: { id: string; number: string } | null; lines: () => Promise<Line[]> };

export function invoiceService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  /** INV-29: exactly the DC's lines at the DC qty and PO rate, else 400; checked before the PO is read. */
  async function dcSource(body: DcInvoiceCreate): Promise<Source> {
    const [stored, dcLines] = await Promise.all([findDc(db, body.dcId), dcLinesToInvoice(db, body.dcId)]);
    if (stored === undefined) throw dcNotFound();
    const issues = validateDcInvoiceLines({ dcLines, lines: body.lines });
    if (issues.length > 0) throw linesError(issues);
    // The lines equal the DC's (INV-29), so they are built from the DC's in its order.
    const lines = dcLines.map(({ dcItemId, poItemId, qty, poRate }) => ({ poItemId, dcItemId, qty, rate: poRate }));
    return { poId: stored.poId, dc: { id: stored.id, number: stored.number }, lines: async () => lines };
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
    const row = await findPoRow(db, poId);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    const [snapshot, numbered, lines] = await Promise.all([
      loadPoSnapshot(db, poId),
      invoicesNumbered(db, supplier, [number]),
      source.lines(),
    ]);

    const now = clock.now();
    const id = newId();
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

    const links = await reresolveLinks(db, {
      supplierId: supplier,
      kind: "invoice",
      numbers: [number],
      docs: [...numbered, { id, number, date: body.invoiceDate }],
    });
    const srvLines = snapshot.srvLines.map((l) =>
      links.changes.has(l.id) ? { ...l, resolvedInvoiceId: links.changes.get(l.id)! } : l,
    );
    const invoiceLines = itemRows.map((r) => ({ id: r.id, invoiceId: id, poItemId: r.poItemId, qty: r.qty, kind }));

    const statements: Statement[] = [
      // An invoice changes the PO's quantities: an edit or create built from the PO before it fails (D-0220).
      updateWithVersion(db, po, poId, row.version, {}),
      db.build.insert(invoice).values(invoiceRow),
      db.build.insert(invoiceItem).values(itemRows),
      ...links.statements,
      ...recomputeStatements(
        { db, clock },
        { ...snapshot, invoiceLines: [...snapshot.invoiceLines, ...invoiceLines], srvLines },
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
      await statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();
    } catch (err) {
      // SPEC-11 §4.2: a unique index refusal is a 409 naming the number and FY, or the DC.
      const collision = invoiceCollision(err);
      if (collision === "number") {
        throw new ConflictError("invoice-number-taken", `Invoice ${number} already exists in FY ${financialYear}.`);
      }
      if (collision === "dc" && dc !== null) throw dcHasInvoice(dc.number);
      throw err;
    }
    return id;
  }

  return {
    /**
     * INV-28 to INV-31, INV-41: stores the invoice in its date's FY, or answers 400, 404 or 409 and writes nothing.
     */
    async create(body: InvoiceCreate) {
      const supplier = await supplierId.require();
      // Numbers are looked up trimmed (INV-24), so they are stored trimmed (D-0248).
      const number = body.number.trim();
      if (number === "") throw fieldError("number-blank", "number", "Enter the invoice number.");
      const id = await retrying(["po"], () => createOnce(supplier, body, number));
      return (await findInvoice(db, id))!;
    },
  };
}

export type InvoiceService = ReturnType<typeof invoiceService>;
