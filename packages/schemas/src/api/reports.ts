// The /reports tabs, the delivery tracker and the exports (SPEC-13, SPEC-10). Rows carry stored values as they
// stand (INV-61); Accepted is the received quantity (INV-09). Export layouts live in the documents catalog.
import { z } from "zod";

import { zPoItem, zPoLot } from "../entities/po.ts";
import { zId, zIsoDate, zMoney, zQty } from "../primitives.ts";
import { zCount, zFyDocRef, zListQuery } from "./common.ts";

const zDateRange = { from: zIsoDate.optional(), to: zIsoDate.optional() };

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

/** Exports are not paged (INV-99); they keep the tab's filters and sort. */
export const zPendingExportQuery = zPendingQuery.omit({ page: true, pageSize: true });
export const zReconciliationExportQuery = zReconciliationQuery.omit({ page: true, pageSize: true });
export const zRegisterExportQuery = z.object(zDateRange);

export const zExportSelectedBody = z.object({
  report: z.enum(["pending", "reconciliation"]),
  poItemIds: z.array(zId).min(1),
});

export const zDcIdQuery = z.object({ dcId: zId });

const trackerFilters = {
  q: z.string().optional(),
  /** The stat cards double as status toggles. */
  status: z.enum(["overdue", "due-soon", "due-this-month"]).optional(),
  dueFrom: zIsoDate.optional(),
  dueTo: zIsoDate.optional(),
  entryFrom: zIsoDate.optional(),
  entryTo: zIsoDate.optional(),
  valueMin: zMoney.optional(),
  valueMax: zMoney.optional(),
};

export const zTrackerQuery = zListQuery(
  ["delyDate", "entryAllowDate", "poNumber", "materialCode", "ordQty", "dspQty", "rcdQty", "pendingValue"],
  trackerFilters,
);

/** One delivery lot with its item's quantities (lots carry only the schedule, INV-06). */
export const zTrackerRow = zPoLot
  .pick({ lotNo: true, delyDate: true, entryAllowDate: true, entryAllowNote: true })
  .extend(
    zPoItem.pick({
      poId: true,
      poItemNo: true,
      materialCode: true,
      description: true,
      drawingNo: true,
      ordQty: true,
      dspQty: true,
      rcdQty: true,
      balanceQty: true,
      rate: true,
    }).shape,
  )
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

export const zTrackerExportQuery = zTrackerQuery.omit({ page: true, pageSize: true });
