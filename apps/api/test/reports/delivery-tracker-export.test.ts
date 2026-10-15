// SPEC-13 PR 5: the delivery-tracker export over the report dataset (today 2025-06-01, 11:00 IST) matches its
// legacy-derived golden, and lists the rows the tracker list shows for the same filters and sort, in its order.
import type { NodeDb } from "@senstosales/db/node";
import { downloadFileName } from "@senstosales/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { reportDb } from "./dataset-db.ts";
import type { GoldenCell } from "./golden.ts";
import { routesOver } from "../seed-rows.ts";
import { workbookGolden, workbookGoldenFile } from "./golden.ts";

let db: NodeDb;
let send: ReturnType<typeof routesOver>;
beforeEach(async () => {
  db = await reportDb();
  send = routesOver(db);
});
afterEach(() => db.close());

const golden = workbookGoldenFile("delivery-tracker.json");

async function exported(query = "") {
  const res = await send(`/api/delivery-tracker/export${query}`);
  expect(res.status).toBe(200);
  return workbookGolden(new Uint8Array(await res.arrayBuffer()), downloadFileName(res), golden.styles);
}

/** A lot as `PO material Lot due-date`, from an export row or a list row. */
const lotOfCells = (row: GoldenCell[]) => row.filter((_, i) => [0, 1, 3, 5].includes(i)).join(" ");

interface ListRow {
  poNumber: string;
  materialCode: string;
  lotNo: number;
  delyDate: string;
}

async function listed(query: string) {
  const res = await send(`/api/delivery-tracker?pageSize=100&${query}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: ListRow[] };
  return body.items.map((r) => `${r.poNumber} ${r.materialCode} L${r.lotNo} ${r.delyDate}`);
}

describe("GET /api/delivery-tracker/export", () => {
  it("matches the golden: open lots, latest due date first, named after the IST minute", async () => {
    expect(await exported()).toEqual(golden);
  });

  it.each([
    "",
    "status=overdue",
    "status=due-this-month",
    "q=hex",
    "dueFrom=2025-06-01&dueTo=2025-06-30",
    "entryFrom=2025-05-01&entryTo=2025-05-31",
    "valueMin=200",
    "sort=poNumber&dir=asc",
    "sort=entryAllowDate&dir=asc",
    "sort=materialCode&dir=desc",
    "sort=pendingValue&dir=desc",
    "sort=rcdQty&dir=asc",
  ])("has the list's rows in the list's order: %s", async (query) => {
    const { rows } = await exported(`?${query}`);
    expect(rows.slice(1).map(lotOfCells)).toEqual(await listed(query));
  });

  it("keeps the status filter: A20 (M-120) is dispatched in full, so only A10's past lot is overdue", async () => {
    const { rows } = await exported("?status=overdue");
    expect(rows.slice(1).map(lotOfCells)).toEqual(["4500101 M-110 L1 2025-05-20"]);
  });

  it("with nothing to list, writes the header row only (EC-45)", async () => {
    expect(await exported("?q=nothing-matches")).toEqual({ ...golden, rows: golden.rows.slice(0, 1) });
  });

  it("rejects an invalid filter before writing anything", async () => {
    const res = await send("/api/delivery-tracker/export?status=late");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid-input", details: { fields: [{ path: "query.status" }] } });
  });
});
