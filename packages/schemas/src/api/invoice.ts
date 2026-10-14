// GST invoices (SPEC-11): previews, create (DC-sourced or PO-direct), header edit, lists and detail. Tax is
// computed by the domain (INV-41); a DC-sourced invoice carries exactly the DC's lines (INV-29).
import { z } from "zod";

import { zFlag } from "../entities/flag.ts";
import { zInvoice, zInvoiceHeader, zInvoiceItem } from "../entities/invoice.ts";
import { zInvoiceKind } from "../enums.ts";
import { zGstPct, zId, zMoney, zQty } from "../primitives.ts";
import { zCount, zDocRef, zFyDocRef, zListQuery, zRangeFilters } from "./common.ts";
import { zItemInfo, zPoRef } from "./dc.ts";

const zInvoiceCore = zInvoice.options[0].pick({
  id: true,
  number: true,
  invoiceDate: true,
  financialYear: true,
  poId: true,
  taxable: true,
  total: true,
});

export const zInvoiceListQuery = zListQuery(
  ["number", "invoiceDate", "poNumber", "itemCount", "qty", "total"],
  zRangeFilters,
);

export const zInvoiceListRow = zInvoiceCore.extend({
  kind: zInvoiceKind,
  poNumber: z.string(),
  dc: zFyDocRef.nullable(),
  itemCount: zCount,
  qty: zQty,
});

export const zInvoiceFilterQuery = zInvoiceListQuery.omit({ page: true, pageSize: true });

/** The legacy KPI cards: count, value, taxable value, tax. */
export const zInvoiceStats = z.object({ count: zCount, total: zMoney, taxable: zMoney, tax: zMoney });

export const zInvoiceDetail = z.object({
  invoice: zInvoice,
  po: zPoRef,
  dc: zFyDocRef.nullable(),
  items: z.array(zInvoiceItem.extend(zItemInfo.shape)),
  /** SRVs whose invoice number resolved to this invoice (INV-37). */
  srvs: z.array(zDocRef),
  flags: z.array(zFlag),
});

export const zDcIdParams = z.object({ dcId: zId });

/**
 * What the create form starts from: header defaults, the settings' GST rates and the lines. From a DC, `qty` is the
 * DC quantity; from a PO it is `null` and `uninvoicedQty` is shown as information, not a cap (INV-05).
 */
export const zInvoicePreview = z.object({
  po: zPoRef,
  dc: zFyDocRef.nullable(),
  header: zInvoiceHeader,
  cgstPct: zGstPct,
  sgstPct: zGstPct,
  lines: z.array(
    zItemInfo.extend({
      poItemId: zId,
      dcItemId: zId.nullable(),
      qty: zQty.nullable(),
      uninvoicedQty: zQty,
    }),
  ),
});

const zInvoiceFields = zInvoice.options[0].pick({ number: true, invoiceDate: true }).extend(zInvoiceHeader.shape);

/** DC-sourced lines repeat the DC qty and PO rate, which the service checks (INV-29); PO-direct lines take the PO rate. */
export const zInvoiceCreateBody = z.discriminatedUnion("kind", [
  zInvoiceFields.extend({
    kind: z.literal(zInvoiceKind.enum.dc),
    dcId: zId,
    lines: z.array(z.object({ dcItemId: zId, qty: zQty, rate: zMoney })),
  }),
  zInvoiceFields.extend({
    kind: z.literal(zInvoiceKind.enum.direct),
    poId: zId,
    lines: z.array(z.object({ poItemId: zId, qty: zQty })),
  }),
]);

/** Header fields only (INV-33); a changed date moves the invoice to its new FY (INV-25). */
export const zInvoiceUpdateBody = zInvoiceFields.extend({ version: zInvoice.options[0].shape.version });
