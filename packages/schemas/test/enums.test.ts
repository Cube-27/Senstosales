import type { ItemStatus, PoStatus } from "@senstosales/domain";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { z } from "zod";

import { zFlagStatus, zFlagType, zInvoiceKind, zItemStatus, zJobStatus, zJobType, zPoStatus } from "../src/index.ts";

describe("enums", () => {
  it("FlagType has exactly the six v1 members (INV-58)", () => {
    expect(zFlagType.options).toEqual([
      "QTY_MISMATCH",
      "DOC_NUMBER_CONFLICT",
      "OVER_DISPATCH",
      "OVER_INVOICE",
      "DOC_ON_CANCELLED_ITEM",
      "MANUAL_ADJUSTMENT_OVERLAP",
    ]);
  });

  it.each([
    [zItemStatus, ["Pending", "Delivered", "Closed", "Cancelled"]],
    [zPoStatus, ["Pending", "Delivered", "Closed"]],
    [zFlagStatus, ["open", "acknowledged"]],
    [zJobType, ["po.scrape", "srv.scrape", "po.import-folder", "srv.import-folder", "recompute-all", "backup"]],
    [zJobStatus, ["queued", "running", "done", "failed", "cancelled"]],
    [zInvoiceKind, ["dc", "direct"]],
  ])("%# has the ARCHITECTURE members", (schema, members) => {
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
