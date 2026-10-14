// SRV list, by-PO list, stats, detail and delete (SPEC-10 §2). The SRV totals are not stored columns, so the lists
// total the filtered SRVs with the domain (C2), then apply the value range, sort and page. Delete is never blocked
// (INV-35) and recomputes the SRV's PO in the same batch (INV-13, INV-14).
import type { Db } from "@senstosales/db";
import { srv, srvItem, WriteBatch } from "@senstosales/db";
import type { Money, Qty, SrvTotals } from "@senstosales/domain";
import { compareIsoDate, srvLineRcd, srvTotals, sumQty } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { NotFoundError } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import type { SrvFilters } from "../repositories/srv-list.ts";
import { findSrvRow, itemsOfSrv, openFlagsOfSrvItems, srvListLines } from "../repositories/srv-list.ts";
import { audit } from "./audit.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";

type Query<N extends "srv.list" | "srv.byPo"> = z.output<(typeof routes)[N]["query"]>;
type Line = Awaited<ReturnType<typeof srvListLines>>[number];
type ValueRange = Pick<SrvFilters, "valueMin" | "valueMax">;

type SrvRow = Pick<Line, "id" | "srvNumber" | "srvDate" | "poNumber" | "poId"> & SrvTotals;
type PoRow = Pick<Line, "poNumber" | "poId"> & SrvTotals & { latestSrvDate: Line["srvDate"]; srvCount: number };

/** SRV and PO numbers are digit strings, so they compare as numbers, as legacy sorts them. */
const byNumber = new Intl.Collator("en", { numeric: true }).compare;
const byQty = (a: number, b: number) => a - b;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Comparator<T> = (a: T, b: T) => number;
const on =
  <T, V>(get: (row: T) => V, compare: (a: V, b: V) => number): Comparator<T> =>
  (a, b) =>
    compare(get(a), get(b));

const totalsSorts = <T extends SrvTotals>() => ({
  ordQty: on<T, Qty>((r) => r.ordQty, byQty),
  rcdQty: on<T, Qty>((r) => r.rcdQty, byQty),
  acceptedQty: on<T, Qty>((r) => r.acceptedQty, byQty),
  rejQty: on<T, Qty>((r) => r.rejQty, byQty),
  value: on<T, Money>((r) => r.value, byQty),
});

const SRV_SORTS: Record<NonNullable<Query<"srv.list">["sort"]>, Comparator<SrvRow>> = {
  srvNumber: on((r) => r.srvNumber, byNumber),
  srvDate: on((r) => r.srvDate, compareIsoDate),
  poNumber: on((r) => r.poNumber, byNumber),
  ...totalsSorts<SrvRow>(),
};

const PO_SORTS: Record<NonNullable<Query<"srv.byPo">["sort"]>, Comparator<PoRow>> = {
  poNumber: on((r) => r.poNumber, byNumber),
  latestSrvDate: on((r) => r.latestSrvDate, compareIsoDate),
  srvCount: on((r) => r.srvCount, byQty),
  ...totalsSorts<PoRow>(),
};

/** Newest first when no sort is given, as legacy; the tie-break keeps every page stable. */
const SRV_DEFAULT: Comparator<SrvRow>[] = [SRV_SORTS.srvDate, SRV_SORTS.srvNumber, on((r) => r.id, byText)];
const PO_DEFAULT: Comparator<PoRow>[] = [PO_SORTS.latestSrvDate, PO_SORTS.poNumber];

/** One page, sorted by the chosen column in `dir`, ties (and no sort) in the default order, newest first. */
function page<T, K extends string>(
  rows: T[],
  query: { page: number; pageSize: number; sort?: K | undefined; dir: "asc" | "desc" },
  sorts: Record<K, Comparator<T>>,
  defaults: readonly Comparator<T>[],
) {
  const chosen: Comparator<T>[] = [];
  if (query.sort !== undefined) {
    const compare = sorts[query.sort];
    chosen.push(query.dir === "desc" ? (a, b) => compare(b, a) : compare);
  }
  const order = [
    ...chosen,
    ...defaults.map(
      (compare): Comparator<T> =>
        (a, b) =>
          compare(b, a),
    ),
  ];
  rows.sort((a, b) => {
    for (const compare of order) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
  const start = (query.page - 1) * query.pageSize;
  return { items: rows.slice(start, start + query.pageSize), total: rows.length };
}

const inRange =
  ({ valueMin, valueMax }: ValueRange) =>
  (row: SrvTotals) =>
    (valueMin === undefined || row.value >= valueMin) && (valueMax === undefined || row.value <= valueMax);

const totalsOf = (lines: readonly Line[]) =>
  srvTotals(
    lines.map(({ poItemId, itemOrdQty, rate, ...line }) => ({
      ...line,
      poItem:
        poItemId === null || itemOrdQty === null || rate === null ? null : { id: poItemId, ordQty: itemOrdQty, rate },
    })),
  );

/** The lines grouped by `key`, each group non-empty, in first-seen order. */
function groupBy<K>(lines: readonly Line[], key: (line: Line) => K): [Line, ...Line[]][] {
  const groups = new Map<K, [Line, ...Line[]]>();
  for (const line of lines) {
    const group = groups.get(key(line));
    if (group) group.push(line);
    else groups.set(key(line), [line]);
  }
  return [...groups.values()];
}

/** One row per SRV the filters keep, value range included. */
async function srvRows(db: Db, filters: SrvFilters): Promise<SrvRow[]> {
  const rows = groupBy(await srvListLines(db, filters), (line) => line.id).map((lines): SrvRow => {
    const [{ id, srvNumber, srvDate, poNumber, poId }] = lines;
    return { id, srvNumber, srvDate, poNumber, poId, ...totalsOf(lines) };
  });
  return rows.filter(inRange(filters));
}

/** One row per PO of the SRVs the filters keep; the value range applies to the PO's total, as legacy. */
async function poRows(db: Db, filters: SrvFilters): Promise<PoRow[]> {
  const rows = groupBy(await srvListLines(db, filters), (line) => line.poNumber).map((lines): PoRow => {
    const [{ poNumber, poId, poOrdQty }] = lines;
    const dates = lines.map((l) => l.srvDate);
    return {
      poNumber,
      poId,
      latestSrvDate: dates.reduce((a, b) => (compareIsoDate(a, b) >= 0 ? a : b)),
      srvCount: new Set(lines.map((l) => l.id)).size,
      ...totalsOf(lines),
      // The by-PO view shows the PO's ordered total; a PO not in the system has none (INV-40).
      ordQty: poOrdQty ?? (0 as Qty),
    };
  });
  return rows.filter(inRange(filters));
}

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

    /** Items show received per INV-11 and Accepted as received (INV-09); the raw numbers stay beside the links (INV-38). */
    async detail(id: string) {
      const [row, items] = await Promise.all([load(id), itemsOfSrv(db, id)]);
      const flags = await openFlagsOfSrvItems(
        db,
        items.map((item) => item.id),
      );
      const shown = items.map((item) => {
        const rcdQty = srvLineRcd(item);
        return { ...item, rcdQty, acceptedQty: rcdQty, rejQty: item.rejQty ?? (0 as Qty) };
      });
      return { srv: row, items: shown, flags };
    },

    /** Removes the SRV and its items; its flags stay until acknowledged (INV-59). */
    async delete(id: string) {
      const row = await load(id);
      const gone = new Set((await itemsOfSrv(db, id)).map((item) => item.id));
      const batch = new WriteBatch(db)
        .add(db.build.delete(srvItem).where(eq(srvItem.srvId, id)))
        .add(db.build.delete(srv).where(eq(srv.id, id)))
        .add(
          audit(db, clock.now(), {
            action: "delete-srv",
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
