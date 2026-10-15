// What the invoice create form starts from (SPEC-11 §2): the PO, the DC if any, header defaults, the settings' GST
// rates and the lines. Each line shows its item's uninvoiced quantity as information, never as a cap (INV-05, C6).
// The defaults are the legacy previews' where v1 stores the field; the rest start blank (EC-36, EC-39).
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { NotFoundError } from "../errors.ts";
import { findDc, invoicesOfDcs } from "../repositories/dc.ts";
import { dcLinesToInvoice } from "../repositories/invoice.ts";
import { findPoRow, itemsOfPo } from "../repositories/po-list.ts";
import { findSupplier, supplierSnapshotOf } from "../repositories/supplier.ts";
import type { SupplierDeps } from "./index.ts";
import { dcHasInvoice } from "./invoice.ts";
import { gstRatesOf } from "./settings.ts";

type Header = z.output<(typeof routes)["invoice.previewPo"]["response"]>["header"];
type Item = Awaited<ReturnType<typeof itemsOfPo>>[number];

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

/** A preview line: the PO item as documents show it, the DC line if any, and the item's uninvoiced quantity. */
const lineOf = (item: Item, dcLine: { dcItemId: string; qty: Item["ordQty"] } | null) => ({
  poItemNo: item.poItemNo,
  materialCode: item.materialCode,
  description: item.description,
  drawingNo: item.drawingNo,
  unit: item.unit,
  rate: item.rate,
  poItemId: item.id,
  dcItemId: dcLine?.dcItemId ?? null,
  qty: dcLine?.qty ?? null,
  uninvoicedQty: item.uninvoicedQty,
});

export function invoicePreviewService({ db, supplierId }: Pick<SupplierDeps, "db" | "supplierId">) {
  /** The PO, its items, the GST rates and the header every preview starts from. */
  async function base(poId: string) {
    const supplier = await supplierId.require();
    const [row, items, rates, supplierRow] = await Promise.all([
      findPoRow(db, poId),
      itemsOfPo(db, poId),
      gstRatesOf(db, supplier),
      findSupplier(db),
    ]);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    const header = {
      ...BLANK_HEADER,
      ...supplierSnapshotOf(supplierRow),
      buyersOrderDate: row.poDate,
      gemcNumber: row.gemcNumber,
    };
    return { po: { id: row.id, poNumber: row.poNumber, isGemc: row.isGemc }, row, items, header, ...rates };
  }

  return {
    /** Every item of the PO with no qty: the user types each line's quantity (INV-31). */
    async fromPo(poId: string) {
      const { row, items, header, ...rest } = await base(poId);
      return {
        ...rest,
        dc: null,
        header: { ...header, remarks: row.remarks },
        lines: items.map((i) => lineOf(i, null)),
      };
    },

    /** The DC's lines at the DC qty, in the DC's order, as the create stores them; 409 once the DC has an invoice. */
    async fromDc(dcId: string) {
      const [stored, dcLines, invoices] = await Promise.all([
        findDc(db, dcId),
        dcLinesToInvoice(db, dcId),
        invoicesOfDcs(db, [dcId]),
      ]);
      if (stored === undefined) throw new NotFoundError("dc-not-found", "This DC was not found.");
      if (invoices.has(dcId)) throw dcHasInvoice(stored.number);
      const { row: _, items, header, ...rest } = await base(stored.poId);
      const byId = new Map(items.map((i) => [i.id, i]));
      return {
        ...rest,
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
        lines: dcLines.map((line) => lineOf(byId.get(line.poItemId)!, line)),
      };
    },
  };
}

export type InvoicePreviewService = ReturnType<typeof invoicePreviewService>;
