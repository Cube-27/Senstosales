// Delivery challans (SPEC-11): the create form's dispatchable items, create, header edit, lists and detail. Lines
// never change after save (INV-33), so the edit body has none.
import { z } from "zod";

import { zDc, zDcHeader, zDcItem } from "../entities/dc.ts";
import { zFlag } from "../entities/flag.ts";
import { zPoItem } from "../entities/po.ts";
import { zCount, zFy, zIsoDate, zMoney, zPackets, zQty } from "../primitives.ts";
import { zDocRef, zFyDocRef, zItemInfo, zListQuery, zPoRef, zRangeFilters } from "./common.ts";

export const zDcListQuery = zListQuery(
  ["number", "dcDate", "poNumber", "ordQty", "dspQty", "rcdQty", "value"],
  zRangeFilters,
);

export const zDcListRow = zDc.pick({ id: true, number: true, dcDate: true, financialYear: true, poId: true }).extend({
  poNumber: z.string(),
  ordQty: zQty,
  dspQty: zQty,
  rcdQty: zQty,
  value: zMoney,
  /** Set when invoiced: hides Create Invoice and blocks delete (INV-28, INV-35). */
  invoice: zFyDocRef.nullable(),
  openFlagCount: zCount,
});

/** The legacy KPI cards: count, dispatched, value, received. */
export const zDcStats = z.object({ count: zCount, dspQty: zQty, value: zMoney, rcdQty: zQty });

export const zDcDetail = z.object({
  dc: zDc,
  po: zPoRef,
  items: z.array(zDcItem.extend(zItemInfo.shape)),
  invoice: zFyDocRef.nullable(),
  /** SRVs whose challan number resolved to this DC (INV-37). */
  srvs: z.array(zDocRef),
  flags: z.array(zFlag),
});

/** The create form: header defaults and the PO's items with their balances (no cap, INV-32). */
export const zDispatchable = z.object({
  po: zPoRef,
  defaults: zDcHeader,
  items: z.array(
    zPoItem
      .pick({ id: true, ordQty: true, dspQty: true, rcdQty: true, balanceQty: true, status: true })
      .extend(zItemInfo.shape),
  ),
});

/** A blank GC number or date defaults to the DC's (INV-26). */
const zGc = { gcNumber: z.string().nullable(), gcDate: zIsoDate.nullable() };

/** The invoice the DC sheet cites (EC-47) and its lot line: optional, as callers that predate them send none. */
const zLaterHeader = {
  invoiceNumber: zDcHeader.shape.invoiceNumber.default(null),
  invoiceDate: zDcHeader.shape.invoiceDate.default(null),
  lotNo: zDcHeader.shape.lotNo.default(null),
};

export const zDcCreateBody = zDc.pick({ poId: true, number: true, dcDate: true }).extend({
  ...zGc,
  ...zDcHeader.shape,
  ...zLaterHeader,
  items: z.array(zDcItem.pick({ poItemId: true, dspQty: true }).extend({ packets: zPackets.default(null) })),
});

/** A changed date moves the DC to its new FY (INV-25); the version guards the edit (INV-95). */
export const zDcUpdateBody = zDc
  .pick({ number: true, dcDate: true, version: true })
  .extend({ ...zGc, ...zDcHeader.shape, ...zLaterHeader });

/** The create forms' live duplicate check: is `(number, FY of date)` taken (INV-22)? */
export const zNumberCheckQuery = z.object({ number: z.string().trim().min(1), date: zIsoDate });

export const zNumberCheck = z.object({ taken: z.boolean(), financialYear: zFy });
