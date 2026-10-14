// PO list, stats, detail, manual create/edit and the manual dispatched quantity (SPEC-10). Response fields are the
// ones the frozen PO screens show (A-2); every quantity and status is a stored derived value (C2).
import { z } from "zod";

import { zFlag } from "../entities/flag.ts";
import { zPo, zPoItem, zPoLot } from "../entities/po.ts";
import { zPoStatus } from "../enums.ts";
import { zCount, zMoney, zQty } from "../primitives.ts";
import { zLinkedDocs, zListQuery, zRangeFilters } from "./common.ts";

const filters = {
  ...zRangeFilters,
  status: zPoStatus.optional(),
  /** Only POs with open flags. */
  flagged: z.stringbool().optional(),
  gemc: z.stringbool().optional(),
};

export const zPoListQuery = zListQuery(
  ["poNumber", "poDate", "itemCount", "ordQty", "dspQty", "rcdQty", "rejQty", "poValue", "status"],
  filters,
);

/** Live linked-document counts (INV-73); open flags for the flag badge. */
const zLinkCounts = z.object({ dcCount: zCount, invoiceCount: zCount, srvCount: zCount, openFlagCount: zCount });

export const zPoListRow = zPo
  .pick({
    id: true,
    poNumber: true,
    poDate: true,
    isGemc: true,
    poValue: true,
    status: true,
    ordQty: true,
    dspQty: true,
    rcdQty: true,
    rejQty: true,
    balanceQty: true,
  })
  .extend({ itemCount: zCount, uninvoicedQty: zQty, ...zLinkCounts.shape });

export const zPoStatsQuery = z.object(filters);

/** The legacy list KPI cards over the filtered rows: count, value, shipped, rejected. */
export const zPoStats = z.object({ count: zCount, poValue: zMoney, dspQty: zQty, rejQty: zQty });

export const zPoDetail = z.object({
  po: zPo,
  items: z.array(zPoItem.extend({ lots: z.array(zPoLot) })),
  linked: zLinkedDocs,
  /** Open flags on the PO and its items; rows are highlighted by `scopeId`. */
  flags: z.array(zFlag),
});

const zPoLine = zPoItem
  .pick({ poItemNo: true, materialCode: true, description: true, drawingNo: true, unit: true, ordQty: true })
  .extend({
    /** GST-inclusive on a GEMC PO; the service stores the derived net (INV-20). */
    rateSource: zMoney,
    lots: z.array(zPoLot.pick({ lotNo: true, delyQty: true, delyDate: true, destCode: true })),
  });

/** The legacy manual PO form (`/po/create`); fields the PO page shows by label go in `rawHeader`. */
export const zPoCreateBody = zPo
  .pick({
    poNumber: true,
    poDate: true,
    enquiry: true,
    quotation: true,
    orderType: true,
    gemcNumber: true,
    remarks: true,
    rawHeader: true,
  })
  .extend({ items: z.array(zPoLine) });

/** An edit sends the version it read (INV-95). */
export const zPoUpdateBody = zPoCreateBody.extend({ version: zPo.shape.version });

/** A-15, INV-08: one manual quantity per item; `qty >= 0` is checked by the service (400). */
export const zManualDispatchedBody = z.object({ qty: zQty, note: z.string().optional() });
