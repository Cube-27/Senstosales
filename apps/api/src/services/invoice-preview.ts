// What the invoice create form starts from (SPEC-11 §2): the PO, the DC if any, header defaults, the settings' GST
// rates and the lines. Each line shows its item's uninvoiced quantity as information, never as a cap (INV-05, C6).
// The defaults are the legacy previews' where v1 stores the field; the rest start blank (EC-36, EC-46). The place of
// supply and each line's HSN start as the settings' defaults (owner, 2026-10-15).
import { INVOICE_DEFAULTS, type routes } from "@senstosales/schemas";
import type { z } from "zod";

import { dcHasInvoice, dcNotFound, NotFoundError } from "../errors.ts";
import { findDc, invoicesOfDcs } from "../repositories/dc.ts";
import { dcLinesToInvoice } from "../repositories/invoice.ts";
import { findPoRow, itemsOfPo } from "../repositories/po-list.ts";
import { findSupplier, supplierSnapshotOf } from "../repositories/supplier.ts";
import type { SupplierDeps } from "./index.ts";
import { gstRatesOf } from "./settings.ts";

type Header = z.output<(typeof routes)["invoice.previewPo"]["response"]>["header"];
type Item = Awaited<ReturnType<typeof itemsOfPo>>[number];
type DcLine = Awaited<ReturnType<typeof dcLinesToInvoice>>[number];

/** Header fields neither the PO nor the DC fills; the supplier's details come from the supplier row. */
const BLANK_HEADER = {
  buyerName: null,
  buyerGstin: null,
  buyerAddress: null,
  buyerState: null,
  buyerStateCode: null,
  placeOfSupply: null,
  buyersOrderDate: null,
  gemcNumber: null,
  gemcDate: null,
  paymentTerms: null,
  despatchDocNo: null,
  srvNo: null,
  srvDate: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  destination: null,
  termsOfDelivery: null,
  remarks: null,
} satisfies Omit<Header, keyof ReturnType<typeof supplierSnapshotOf>>;

/** The PO item columns a preview line shows. */
const itemInfo = ({ poItemNo, materialCode, description, drawingNo, unit }: Item | DcLine) => ({
  poItemNo,
  materialCode,
  description,
  drawingNo,
  unit,
});

export function invoicePreviewService({ db, supplierId }: Pick<SupplierDeps, "db" | "supplierId">) {
  /** The PO, the GST rates and the header every preview starts from: the legacy PO-sourced defaults. */
  async function base(poId: string) {
    const supplier = await supplierId.require();
    const [row, rates, supplierRow] = await Promise.all([
      findPoRow(db, poId),
      gstRatesOf(db, supplier),
      findSupplier(db),
    ]);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    const defaults = supplierRow?.invoiceDefaults ?? {};
    const header = {
      ...BLANK_HEADER,
      ...supplierSnapshotOf(supplierRow),
      placeOfSupply: defaults[INVOICE_DEFAULTS.placeOfSupply] ?? null,
      buyersOrderDate: row.poDate,
      gemcNumber: row.gemcNumber,
      remarks: row.remarks,
    };
    const hsn = defaults[INVOICE_DEFAULTS.hsn] ?? null;
    return { po: { id: row.id, poNumber: row.poNumber, isGemc: row.isGemc }, header, hsn, ...rates };
  }

  return {
    /** Every item of the PO with no qty: the user types each line's quantity (INV-31). */
    async fromPo(poId: string) {
      const [{ hsn, ...preview }, items] = await Promise.all([base(poId), itemsOfPo(db, poId)]);
      const lines = items.map((item) => ({
        ...itemInfo(item),
        rate: item.rate,
        poItemId: item.id,
        dcItemId: null,
        qty: null,
        uninvoicedQty: item.uninvoicedQty,
        hsn,
        packets: null,
      }));
      return { ...preview, dc: null, lines };
    },

    /** The DC's lines at the DC qty, in the DC's order, as the create stores them; 409 once the DC has an invoice. */
    async fromDc(dcId: string) {
      const [stored, dcLines, invoices] = await Promise.all([
        findDc(db, dcId),
        dcLinesToInvoice(db, dcId),
        invoicesOfDcs(db, [dcId]),
      ]);
      if (stored === undefined) throw dcNotFound();
      if (invoices.has(dcId)) throw dcHasInvoice(stored.number);
      const { header, hsn, ...preview } = await base(stored.poId);
      return {
        ...preview,
        dc: { id: stored.id, number: stored.number, date: stored.dcDate, financialYear: stored.financialYear },
        header: {
          ...header,
          buyerName: stored.consigneeName,
          buyerGstin: stored.consigneeGstin,
          buyerAddress: stored.consigneeAddress,
          vehicleNo: stored.vehicleNo,
          lrNo: stored.lrNo,
          transporter: stored.transporter,
          remarks: stored.remarks,
        },
        lines: dcLines.map((line) => ({
          ...itemInfo(line),
          rate: line.poRate,
          poItemId: line.poItemId,
          dcItemId: line.dcItemId,
          qty: line.qty,
          uninvoicedQty: line.uninvoicedQty,
          hsn,
          packets: line.packets,
        })),
      };
    },
  };
}

export type InvoicePreviewService = ReturnType<typeof invoicePreviewService>;
