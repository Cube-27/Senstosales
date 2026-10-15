// The seeded report dataset recomputes to the derived columns the goldens were worked from by hand.
import { po, poItem } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { reportDb } from "./dataset-db.ts";

let db: NodeDb;
beforeAll(async () => {
  db = await reportDb();
});
afterAll(() => db.close());

describe("report dataset", () => {
  it("recomputes each item to the dataset's worked values", async () => {
    const items = await db.query(
      db.build
        .select({
          no: poItem.poItemNo,
          po: po.poNumber,
          dspQty: poItem.dspQty,
          rcdQty: poItem.rcdQty,
          rejQty: poItem.rejQty,
          balanceQty: poItem.balanceQty,
          status: poItem.status,
        })
        .from(poItem)
        .innerJoin(po, eq(po.id, poItem.poId))
        .orderBy(po.poNumber, poItem.poItemNo),
    );
    expect(items).toEqual([
      { po: "4500101", no: 10, dspQty: 9_000, rcdQty: 6_000, rejQty: 0, balanceQty: 1_000, status: "Pending" },
      { po: "4500101", no: 20, dspQty: 5_000, rcdQty: 4_000, rejQty: 1_000, balanceQty: 0, status: "Delivered" },
      { po: "4500102", no: 10, dspQty: 1_250, rcdQty: 0, rejQty: 0, balanceQty: 1_250, status: "Pending" },
      { po: "4500103", no: 10, dspQty: 4_000, rcdQty: 4_000, rejQty: 0, balanceQty: 0, status: "Closed" },
    ]);
  });

  it("recomputes each PO's status and ordered total", async () => {
    const pos = await db.query(
      db.build.select({ po: po.poNumber, status: po.status, ordQty: po.ordQty }).from(po).orderBy(po.poNumber),
    );
    expect(pos).toEqual([
      { po: "4500101", status: "Pending", ordQty: 15_000 },
      { po: "4500102", status: "Pending", ordQty: 2_500 },
      { po: "4500103", status: "Closed", ordQty: 4_000 },
    ]);
  });
});
