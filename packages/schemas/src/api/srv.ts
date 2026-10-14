// SRV lists (flat and grouped by PO), stats and detail (SPEC-10). An SRV whose PO is not in the system has
// `poId: null` and is labelled "PO not found" (INV-40).
import { z } from "zod";

import { zFlag } from "../entities/flag.ts";
import { zSrv, zSrvItem } from "../entities/srv.ts";
import { zCount, zIsoDate, zMoney, zQty } from "../primitives.ts";
import { zListQuery, zRangeFilters } from "./common.ts";

const filters = {
  ...zRangeFilters,
  /** The SRVs of one PO: the expanded rows of the by-PO view. */
  poNumber: z.string().optional(),
};

/** Summed over the SRV's items; Accepted is shown as received (A2-8, INV-09). */
const zSrvTotals = z.object({ ordQty: zQty, rcdQty: zQty, acceptedQty: zQty, rejQty: zQty, value: zMoney });

export const zSrvListQuery = zListQuery(
  ["srvNumber", "srvDate", "poNumber", "ordQty", "rcdQty", "acceptedQty", "rejQty", "value"],
  filters,
);

export const zSrvListRow = zSrv
  .pick({ id: true, srvNumber: true, srvDate: true, poNumber: true, poId: true })
  .extend(zSrvTotals.shape);

export const zSrvByPoQuery = zListQuery(
  ["poNumber", "latestSrvDate", "srvCount", "ordQty", "rcdQty", "acceptedQty", "rejQty", "value"],
  zRangeFilters,
);

export const zSrvByPoRow = zSrv
  .pick({ poNumber: true, poId: true })
  .extend({ latestSrvDate: zIsoDate, srvCount: zCount, ...zSrvTotals.shape });

export const zSrvStatsQuery = z.object(filters);

/** The legacy KPI cards of both views: SRVs (or POs), received, accepted, rejected. */
export const zSrvStats = z.object({
  srvCount: zCount,
  poCount: zCount,
  rcdQty: zQty,
  acceptedQty: zQty,
  rejQty: zQty,
});

/** Items keep the raw challan and invoice numbers beside the resolved links (INV-38). */
export const zSrvDetail = z.object({ srv: zSrv, items: z.array(zSrvItem), flags: z.array(zFlag) });
