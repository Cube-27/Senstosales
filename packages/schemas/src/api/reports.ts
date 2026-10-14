// The /reports tabs, the delivery tracker and the exports (SPEC-13, SPEC-10). Rows carry stored values as they
// stand (INV-61); Accepted is the received quantity (INV-09). Export layouts live in the documents catalog.
import { z } from "zod";

import { zPoItem, zPoLot } from "../entities/po.ts";
import { zCount, zId, zIsoDate, zMoney, zQty } from "../primitives.ts";
import { zDateRange, zFyDocRef, zItemInfo, zListQuery, zRangeFilters } from "./common.ts";

const zReportItem = zPoItem
  .pick({ poId: true, description: true, ordQty: true, dspQty: true })
  .extend({ poItemId: zId, poNumber: z.string() });

export const zPendingQuery = zListQuery(["description", "poNumber", "poDate", "ordQty", "dspQty"], zDateRange);

/** A PO item with quantity still to supply, and the documents raised on it. */
export const zPendingRow = zReportItem.extend({
  gemcNumbers: z.array(z.string()),
  dcs: z.array(zFyDocRef),
  invoices: z.array(zFyDocRef),
});

const reconciliationFilters = { ...zDateRange, poId: zId.optional() };

export const zReconciliationQuery = zListQuery(
  ["description", "poNumber", "ordQty", "dspQty", "rcdQty", "rejQty"],
  reconciliationFilters,
);

/** Ordered, delivered (dispatched), received and rejected per PO item. */
export const zReconciliationRow = zReportItem.extend({ rcdQty: zQty, rejQty: zQty });

export const zRegisterExportQuery = z.object(zDateRange);

/** The reconciliation rows of the selected POs (SPEC-13 §2). */
export const zExportSelectedBody = z.object({ poIds: z.array(zId).min(1) });

export const zDcIdQuery = z.object({ dcId: zId });

const { q, valueMin, valueMax } = zRangeFilters;

const trackerFilters = {
  q,
  /** The stat cards double as status toggles. */
  status: z.enum(["overdue", "due-soon", "due-this-month"]).optional(),
  dueFrom: zIsoDate.optional(),
  dueTo: zIsoDate.optional(),
  entryFrom: zIsoDate.optional(),
  entryTo: zIsoDate.optional(),
  valueMin,
  valueMax,
};

export const zTrackerQuery = zListQuery(
  ["delyDate", "entryAllowDate", "poNumber", "materialCode", "ordQty", "dspQty", "rcdQty", "pendingValue"],
  trackerFilters,
);

/** One delivery lot with its item's quantities (lots carry only the schedule, INV-06). */
export const zTrackerRow = zPoLot
  .pick({ lotNo: true, delyDate: true, entryAllowDate: true, entryAllowNote: true })
  .extend(zPoItem.pick({ poId: true, ordQty: true, dspQty: true, rcdQty: true, balanceQty: true }).shape)
  .extend(zItemInfo.omit({ unit: true }).shape)
  .extend({
    lotId: zId,
    poItemId: zId,
    poNumber: z.string(),
    pendingValue: zMoney,
    /** Days until the delivery date, negative when overdue; `null` without a date. */
    daysToDue: z.int().nullable(),
  });

export const zTrackerStatsQuery = z.object(trackerFilters);

export const zTrackerStats = z.object({
  overdueCount: zCount,
  dueSoonCount: zCount,
  dueThisMonthCount: zCount,
  pendingValue: zMoney,
});
