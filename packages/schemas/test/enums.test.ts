import type { ItemStatus, PoStatus } from "@senstosales/domain";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { z } from "zod";

import { zFlagStatus, zFlagType, zInvoiceKind, zItemStatus, zJobStatus, zJobType, zPoStatus } from "../src/index.ts";

const FLAG_TYPES = [
  "QTY_MISMATCH",
  "DOC_NUMBER_CONFLICT",
  "OVER_DISPATCH",
  "OVER_INVOICE",
  "DOC_ON_CANCELLED_ITEM",
  "MANUAL_ADJUSTMENT_OVERLAP",
];

describe("enums", () => {
  it.each([
    ["FlagType (six v1 types, INV-58)", zFlagType, FLAG_TYPES],
    ["ItemStatus", zItemStatus, ["Pending", "Delivered", "Closed", "Cancelled"]],
    ["PoStatus", zPoStatus, ["Pending", "Delivered", "Closed"]],
    ["FlagStatus", zFlagStatus, ["open", "acknowledged"]],
    [
      "JobType",
      zJobType,
      ["po.scrape", "srv.scrape", "po.import-folder", "srv.import-folder", "recompute-all", "backup"],
    ],
    ["JobStatus", zJobStatus, ["queued", "running", "done", "failed", "cancelled"]],
    ["InvoiceKind", zInvoiceKind, ["dc", "direct"]],
  ])("%s has exactly the ARCHITECTURE members", (_name, schema, members) => {
    expect(schema.options).toEqual(members);
  });

  it("rejects a value outside the enum", () => {
    expect(zFlagType.safeParse("PRICE_MISMATCH").success).toBe(false);
    expect(zItemStatus.safeParse("pending").success).toBe(false);
  });

  it("item and PO status match the domain's types", () => {
    expectTypeOf<z.infer<typeof zItemStatus>>().toEqualTypeOf<ItemStatus>();
    expectTypeOf<z.infer<typeof zPoStatus>>().toEqualTypeOf<PoStatus>();
  });
});
