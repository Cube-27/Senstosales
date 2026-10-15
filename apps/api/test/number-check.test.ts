// The create forms' live duplicate check (D-0097): is `(number, FY of date)` taken? Numbers restart each FY (INV-22)
// and are compared trimmed (INV-24, D-0248). Synthetic values only (C1).
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import { ready } from "./dc-fixtures.ts";

afterEach(closeApiApps);

/** DC 7 on 2025-04-02 (FY 2025-26) and invoice 31 on that DC, 2025-04-03. */
async function stored() {
  const r = await ready();
  const { poId, item10 } = await r.storedPo();
  const dc = await r.createDc({ poId, number: "7", dcDate: "2025-04-02", items: [{ poItemId: item10, dspQty: "4" }] });
  await r.invoiceOnDc({ id: "01J9Z8Q4S5T6V7W8X9Y0Z1INV1", dcId: dc.body.id, number: "31", invoiceDate: "2025-04-03" });
  return r;
}

describe.each([
  ["dc", "7"],
  ["invoice", "31"],
])("GET /api/%s/number-check", (kind, number) => {
  test.each([
    [number, "2025-06-01", { taken: true, financialYear: "2025-26" }],
    [` ${number} `, "2026-03-31", { taken: true, financialYear: "2025-26" }],
    [number, "2025-03-31", { taken: false, financialYear: "2024-25" }],
    [number, "2026-04-01", { taken: false, financialYear: "2026-27" }],
    ["999", "2025-06-01", { taken: false, financialYear: "2025-26" }],
  ])("%j on %s -> %j", async (n, date, expected) => {
    const { send } = await stored();
    const res = await send(`/api/${kind}/number-check?number=${encodeURIComponent(n)}&date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expected);
  });

  test("an empty number is invalid", async () => {
    const { send } = await stored();
    expect((await send(`/api/${kind}/number-check?number=&date=2025-06-01`)).status).toBe(400);
  });
});
