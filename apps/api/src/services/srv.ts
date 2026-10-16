// SRV list, by-PO list, stats, detail and delete (SPEC-10 §2). The SRV totals are not stored columns, so the lists
// total the filtered SRVs with the domain (C2), then apply the value range, sort and page. Delete is never blocked
// (INV-35) and recomputes the SRV's PO in the same batch (INV-13, INV-14).
import type { Db } from "@senstosales/db";
import { srv, srvItem, WriteBatch } from "@senstosales/db";
import type { Qty, SrvTotals } from "@senstosales/domain";
import { compareIsoDate, srvLineShown, srvTotals, sumQty } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { NotFoundError } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import type { SrvFilters } from "../repositories/srv-list.ts";
import { findSrvRow, itemIdsOfSrv, itemsOfSrv, openFlagsOfSrv, srvListLines } from "../repositories/srv-list.ts";
import { audit } from "./audit.ts";
import type { Comparator } from "./paging.ts";
import { byNum, byNumber, byText, desc, on, page } from "./paging.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";

type Query<N extends "srv.list" | "srv.byPo"> = z.output<(typeof routes)[N]["query"]>;
type Line = Awaited<ReturnType<typeof srvListLines>>[number];

type SrvRow = Pick<Line, "id" | "srvNumber" | "srvDate" | "poNumber" | "poId"> & SrvTotals;
type PoRow = Pick<Line, "poNumber" | "poId"> & SrvTotals & { latestSrvDate: Line["srvDate"]; srvCount: number };

const totalsSorts = <T extends SrvTotals>() => {
  const field = (key: keyof SrvTotals) => on<T, number>((r) => r[key], byNum);
  return {
    ordQty: field("ordQty"),
    rcdQty: field("rcdQty"),
    acceptedQty: field("acceptedQty"),
    rejQty: field("rejQty"),
    value: field("value"),
  };
};

const SRV_SORTS: Record<NonNullable<Query<"srv.list">["sort"]>, Comparator<SrvRow>> = {
  srvNumber: on((r) => r.srvNumber, byNumber),
  srvDate: on((r) => r.srvDate, compareIsoDate),
  poNumber: on((r) => r.poNumber, byNumber),
  ...totalsSorts<SrvRow>(),
};

const PO_SORTS: Record<NonNullable<Query<"srv.byPo">["sort"]>, Comparator<PoRow>> = {
  poNumber: on((r) => r.poNumber, byNumber),
  latestSrvDate: on((r) => r.latestSrvDate, compareIsoDate),
  srvCount: on((r) => r.srvCount, byNum),
  ...totalsSorts<PoRow>(),
};

/** Newest first, as legacy lists without a sort; also the tie-break of every sort, so pages are stable. */
const SRV_DEFAULT = [desc(SRV_SORTS.srvDate), desc(SRV_SORTS.srvNumber), desc(on<SrvRow, string>((r) => r.id, byText))];
const PO_DEFAULT = [desc(PO_SORTS.latestSrvDate), desc(PO_SORTS.poNumber)];

/** The filtered lines grouped by `key`, one row per group, then the value range applied to the rows. */
async function rowsBy<K, R extends SrvTotals>(
  db: Db,
  filters: SrvFilters,
  key: (line: Line) => K,
  toRow: (lines: [Line, ...Line[]]) => R,
): Promise<R[]> {
  const groups = new Map<K, [Line, ...Line[]]>();
  for (const line of await srvListLines(db, filters)) {
    const group = groups.get(key(line));
    if (group) group.push(line);
    else groups.set(key(line), [line]);
  }
  const { valueMin, valueMax } = filters;
  return [...groups.values()]
    .map(toRow)
    .filter(
      (row) => (valueMin === undefined || row.value >= valueMin) && (valueMax === undefined || row.value <= valueMax),
    );
}

/** One row per SRV the filters keep. */
const srvRows = (db: Db, filters: SrvFilters) =>
  rowsBy(
    db,
    filters,
    (line) => line.id,
    (lines): SrvRow => {
      const [{ id, srvNumber, srvDate, poNumber, poId }] = lines;
      return { id, srvNumber, srvDate, poNumber, poId, ...srvTotals(lines) };
    },
  );

/** One row per PO of the SRVs the filters keep; the value range applies to the PO's total, as legacy. */
const poRows = (db: Db, filters: SrvFilters) =>
  rowsBy(
    db,
    filters,
    (line) => line.poNumber,
    (lines): PoRow => {
      const [{ poNumber, poId, poOrdQty, srvDate }] = lines;
      return {
        poNumber,
        poId,
        latestSrvDate: lines.reduce(
          (latest, l) => (compareIsoDate(latest, l.srvDate) >= 0 ? latest : l.srvDate),
          srvDate,
        ),
        srvCount: new Set(lines.map((l) => l.id)).size,
        ...srvTotals(lines),
        // The by-PO view shows the PO's stored ordered total; a PO not in the system has none (INV-40).
        ordQty: poOrdQty ?? (0 as Qty),
      };
    },
  );

export function srvService({ db, clock }: { db: Db; clock: Clock }) {
  async function load(id: string) {
    const row = await findSrvRow(db, id);
    if (row === undefined) throw new NotFoundError("srv-not-found", "This SRV was not found.");
    return row;
  }

  return {
    list: async (query: Query<"srv.list">) => page(await srvRows(db, query), query, SRV_SORTS, SRV_DEFAULT),

    byPo: async (query: Query<"srv.byPo">) => page(await poRows(db, query), query, PO_SORTS, PO_DEFAULT),

    /** The KPI cards over the SRVs the filters keep. */
    async stats(filters: SrvFilters) {
      const rows = await srvRows(db, filters);
      const sum = (key: "rcdQty" | "acceptedQty" | "rejQty") => sumQty(rows.map((r) => r[key]));
      return {
        srvCount: rows.length,
        poCount: new Set(rows.map((r) => r.poNumber)).size,
        rcdQty: sum("rcdQty"),
        acceptedQty: sum("acceptedQty"),
        rejQty: sum("rejQty"),
      };
    },

    /**
     * Items as the SRV screens show them, RECVD as printed beside the received it counts as; the raw numbers stay
     * beside the resolved links (INV-38).
     */
    async detail(id: string) {
      const [row, items, flags] = await Promise.all([load(id), itemsOfSrv(db, id), openFlagsOfSrv(db, id)]);
      return { srv: row, items: items.map((item) => ({ ...item, rawRcdQty: item.rcdQty, ...srvLineShown(item) })), flags };
    },

    /** Removes the SRV and its items; its flags stay until acknowledged (INV-59). */
    async delete(id: string) {
      const [row, items] = await Promise.all([load(id), itemIdsOfSrv(db, id)]);
      const gone = new Set(items.map((item) => item.id));
      const batch = new WriteBatch(db)
        .add(db.build.delete(srvItem).where(eq(srvItem.srvId, id)))
        .add(db.build.delete(srv).where(eq(srv.id, id)))
        .add(
          audit(db, clock.now(), {
            action: "srv.delete",
            entityType: "srv",
            entityId: id,
            before: { poNumber: row.poNumber, srvNumber: row.srvNumber, srvDate: row.srvDate, items: gone.size },
          }),
        );
      // An SRV of a PO not in the system changed no PO, so there is nothing to recompute (INV-40).
      if (row.poId !== null) {
        const snapshot = await loadPoSnapshot(db, row.poId);
        const srvLines = snapshot.srvLines.filter((line) => !gone.has(line.id));
        for (const statement of recomputeStatements({ db, clock }, { ...snapshot, srvLines })) batch.add(statement);
      }
      await batch.commit();
      return { ok: true as const };
    },
  };
}

export type SrvService = ReturnType<typeof srvService>;
