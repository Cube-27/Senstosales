// GST invoices (SPEC-11 §2, §4.2). A DC-sourced invoice carries exactly the DC's lines at the DC qty and PO rate, else
// 400 and nothing written (INV-29, A-8); a DC has one invoice (INV-28). Tax uses the settings' GST rates, copied onto
// the invoice (INV-41, A2-4). A create is one batch: the PO version guard, the invoice and its lines, the SRV links to
// its number, the PO recompute with its flags, and the audit row (C4).
import type { Statement } from "@senstosales/db";
import { invoice, invoiceItem, po, updateWithVersion, WriteBatch } from "@senstosales/db";
import type { Issue } from "@senstosales/domain";
import { fyOf, invoiceLineTax, invoiceTotals, validateDcInvoiceLines } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { ConflictError, fieldError, NotFoundError, ValidationError } from "../errors.ts";
import { newId } from "../ids.ts";
import { findDc } from "../repositories/dc.ts";
import { dcLinesToInvoice, findInvoice, invoiceCollision, invoicesNumbered } from "../repositories/invoice.ts";
import { findPoRow } from "../repositories/po-list.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";
import { reresolveLinks } from "./links.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";
import { retrying } from "./retry.ts";
import { gstRatesOf } from "./settings.ts";

export type InvoiceCreate = z.output<(typeof routes)["invoice.create"]["body"]>;
type DcInvoiceCreate = Extract<InvoiceCreate, { kind: "dc" }>;

export function invoiceService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  /**
   * One attempt: reads the DC and its PO, then builds and commits the batch. A retry reads the DC again, so a DC
   * deleted meanwhile is a 404.
   */
  async function createOnce(supplier: string, body: DcInvoiceCreate, number: string) {
    const [stored, dcLines, rates] = await Promise.all([
      findDc(db, body.dcId),
      dcLinesToInvoice(db, body.dcId),
      gstRatesOf(db, supplier),
    ]);
    if (stored === undefined) throw new NotFoundError("dc-not-found", "This DC was not found.");
    const issues = validateDcInvoiceLines({ dcLines, lines: body.lines });
    if (issues.length > 0) throw linesError(issues);
    const { poId } = stored;
    // The version is read before the snapshot, so a PO changed in between fails the batch (D-0220, INV-95).
    const row = await findPoRow(db, poId);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    const [snapshot, numbered] = await Promise.all([
      loadPoSnapshot(db, poId),
      invoicesNumbered(db, supplier, [number]),
    ]);

    const now = clock.now();
    const id = newId();
    const financialYear = fyOf(body.invoiceDate);
    const { cgstPct, sgstPct } = rates;
    // The lines equal the DC's (INV-29), so they are built from the DC's in its order.
    const itemRows = dcLines.map((line) => ({
      id: newId(),
      supplierId: supplier,
      invoiceId: id,
      poItemId: line.poItemId,
      dcItemId: line.dcItemId,
      qty: line.qty,
      rate: line.poRate,
      ...invoiceLineTax({ qty: line.qty, rate: line.poRate, cgstPct, sgstPct, gemc: row.isGemc }),
    }));
    const totals = invoiceTotals(itemRows);
    const { kind, dcId, lines: _, ...header } = body;
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
          lines: itemRows.map((r) => ({ dcItemId: r.dcItemId, qty: r.qty, rate: r.rate })),
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
      if (collision === "dc") throw new ConflictError("dc-has-invoice", `DC ${stored.number} already has an invoice.`);
      throw err;
    }
    return id;
  }

  return {
    /** INV-28, INV-29, INV-41: stores the invoice in its date's FY, or answers 400, 404 or 409 and writes nothing. */
    async create(body: InvoiceCreate) {
      // PO-direct invoices arrive with SPEC-11 PR 4.
      if (body.kind !== "dc")
        throw new ValidationError("kind-unavailable", "PO-direct invoices are not available yet.");
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

/** The 400 for invalid lines: the first issue's code, and every issue at its body path (SPEC-11 §4.3, D-0250). */
function linesError(issues: readonly Issue[]): ValidationError {
  const fields = issues.map((issue) => ({ path: `body.${issue.path}`, message: issue.message }));
  return new ValidationError(issues[0]!.code, issues[0]!.message, { fields });
}
