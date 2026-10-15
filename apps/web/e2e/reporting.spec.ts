// SPEC-17 end to end: the deviations, ledger, delivery tracker and reports screens over synthetic data written through
// the API, as the app would write it. The tests share one API (worker scope) with the other specs and run in order:
// the first writes a PO of its own that the later ones find through the search box. Synthetic values only (C1).
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";
import { SUPPLIER } from "./dataset.ts";
import { signIn } from "./session.ts";

const PO_NUMBER = "4100000501";
const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Today's IST date, moved by `days`. */
const istDate = (days = 0): string => new Date(Date.now() + IST_MS + days * DAY_MS).toISOString().slice(0, 10);

async function post(page: Page, path: string, data: unknown): Promise<unknown> {
  const res = await page.request.post(path, { data });
  expect(res.ok(), `${path} answered ${res.status()}: ${await res.text()}`).toBe(true);
  return res.json();
}

const line = (poItemNo: number, ordQty: string, delyDate: string) => ({
  poItemNo,
  materialCode: `SYN-${poItemNo}`,
  description: `Synthetic part ${poItemNo}`,
  drawingNo: null,
  unit: "NOS",
  ordQty,
  rateSource: "100",
  lots: [{ lotNo: 1, delyQty: ordQty, delyDate, destCode: null }],
});

const dcHeader = Object.fromEntries(
  [
    "ourRef",
    "departmentNo",
    "consigneeName",
    "consigneeGstin",
    "consigneeAddress",
    "inspectionCompany",
    "ewayBillNo",
    "vehicleNo",
    "lrNo",
    "transporter",
    "modeOfTransport",
    "remarks",
  ].map((key) => [key, null]),
);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("writes a PO dated today and a DC over its item 10, which raises an over-dispatch flag", async ({ page }) => {
  const po = (await post(page, "/api/po", {
    poNumber: PO_NUMBER,
    poDate: istDate(),
    enquiry: null,
    quotation: null,
    orderType: null,
    gemcNumber: null,
    remarks: null,
    rawHeader: {},
    // Item 10 is over-dispatched below; item 20 is overdue: due three days ago with nothing sent.
    items: [line(10, "10", istDate(-3)), line(20, "5", istDate(-3))],
  })) as { id: string };
  const detail = (await (await page.request.get(`/api/po/${po.id}`)).json()) as {
    items: { id: string; poItemNo: number }[];
  };
  const item10 = detail.items.find((i) => i.poItemNo === 10);
  await post(page, "/api/dc", {
    poId: po.id,
    number: "E2E-1",
    dcDate: istDate(),
    gcNumber: null,
    gcDate: null,
    ...dcHeader,
    // The DC carries the supplier's details as printed on it.
    supplierName: SUPPLIER.name,
    supplierAddress: SUPPLIER.address,
    supplierGstin: SUPPLIER.gstin,
    supplierContact: SUPPLIER.contact,
    items: [{ poItemId: item10?.id, dspQty: "12" }],
  });
  const flags = (await (await page.request.get(`/api/flags?status=open&poId=${po.id}`)).json()) as {
    items: { type: string }[];
  };
  expect(flags.items.map((f) => f.type)).toEqual(["OVER_DISPATCH"]);
});

test("deviations: Show resolved moves nothing; resolving with a note marks the flag resolved", async ({ page }) => {
  await page.goto(`/deviations?q=${PO_NUMBER}`);
  const row = page.getByRole("row").filter({ hasText: "OVER DISPATCH" });
  await expect(row).toContainText(PO_NUMBER);
  await expect(row).toContainText("Open");
  // CSS locators: the open dialog hides the page from role queries.
  const around = {
    header: page.locator("h1"),
    table: page.locator("table"),
    pager: page.locator("nav[aria-label=Pagination]"),
  };
  const showResolved = page.getByRole("checkbox", { name: "Show resolved" });
  await expectNoLayoutShift(page, around, () => showResolved.click());
  await showResolved.click();

  await row.getByRole("button", { name: "Resolve" }).click();
  const dialog = page.getByRole("dialog", { name: "Resolve deviation?" });
  await dialog.getByLabel("Note (optional)").fill("Extra sent as spares");
  await expectNoLayoutShift(page, around, async () => {
    await dialog.getByRole("button", { name: "Resolve" }).click();
    await expect(page.getByText("No deviations found for the current filters")).toBeVisible();
  });
  await showResolved.click();
  await expect(page.getByRole("row").filter({ hasText: "OVER DISPATCH" })).toContainText("Resolved");
});

test("ledger: lists the audit rows of the earlier writes, filters by module, and has no delete control", async ({
  page,
}) => {
  await page.goto("/system/ledger");
  // Newest first: this spec's writes head the list.
  for (const event of ["Po Create", "Dc Create", "Flag Acknowledge"]) {
    await expect(page.getByRole("cell", { name: event, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /reset|delete|prune/i })).toHaveCount(0);
  const around = { table: page.locator("table"), pager: page.getByRole("navigation", { name: "Pagination" }) };
  await expectNoLayoutShift(page, around, async () => {
    await page.getByRole("combobox", { name: "Module" }).click();
    await page.getByRole("option", { name: "Dispatch (DC)" }).click();
    await expect(page.getByRole("cell", { name: "Po Create", exact: true })).toHaveCount(0);
  });
  await page.getByRole("cell", { name: "Dc Create", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Log Details" })).toContainText("dc.create");
});

test("delivery tracker: cards and chips move nothing; Download saves the tracker workbook", async ({ page }) => {
  await page.goto(`/delivery-tracker?q=${PO_NUMBER}`);
  await expect(page.getByRole("cell", { name: "3d overdue" }).first()).toBeVisible();
  const around = {
    summary: page.getByRole("region", { name: "Page summary" }),
    table: page.locator("table"),
    pager: page.getByRole("navigation", { name: "Pagination" }),
    download: page.getByRole("button", { name: "Download" }),
  };
  await expectNoLayoutShift(page, around, () => page.getByRole("button", { name: /Overdue/ }).click());
  await expectNoLayoutShift(page, around, () => page.getByRole("button", { name: "This Week", exact: true }).click());
  await expectNoLayoutShift(page, around, () => page.getByRole("button", { name: "High Value ₹1L+" }).click());
  await expectNoLayoutShift(page, around, () => page.getByRole("button", { name: "Clear all" }).click());
  await expectNoLayoutShift(page, around, () => page.getByRole("button", { name: "More Filters" }).click());
  await page.keyboard.press("Escape");

  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await saved).suggestedFilename()).toMatch(/^Delivery_Tracker_\d{8}_\d{4}\.xlsx$/);
});

test("reports: tabs move nothing; Download saves the tab's workbook and a selection the selected POs'", async ({
  page,
}) => {
  await page.goto(`/reports?q=${PO_NUMBER}`);
  await expect(page.getByRole("button", { name: "Daily Dispatch" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Synthetic part 20" })).toBeVisible();
  const around = {
    header: page.getByRole("heading", { level: 1, name: "Operations Insights" }),
    tabs: page.getByRole("group", { name: "Report" }),
    table: page.locator("table"),
    pager: page.getByRole("navigation", { name: "Pagination" }),
    download: page.getByRole("button", { name: "Download" }),
  };
  await expectNoLayoutShift(page, around, async () => {
    await page.getByRole("button", { name: "Audit Ledger" }).click();
    await expect(page.getByRole("columnheader", { name: "Rejected" })).toBeVisible();
  });

  let saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await saved).suggestedFilename()).toBe("PO_Reconciliation_Report.xlsx");

  await page.getByRole("button", { name: "Items Summary" }).click();
  saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await saved).suggestedFilename()).toBe(`Items_Summary_${istDate(-1)}_to_${istDate()}.xlsx`);

  await page.getByRole("checkbox", { name: "Select row 1" }).click();
  saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download (1)" }).click();
  expect((await saved).suggestedFilename()).toBe("PO_Reconciliation_Report.xlsx");
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
});

// SPEC-17 §7: light and dark screenshots of the four screens, as review artefacts (CI uploads `test-results/`).
const SCREENS = [
  { name: "deviations", path: "/deviations?resolved=true", heading: "Deviations" },
  { name: "ledger", path: "/system/ledger", heading: "System Audit Ledger" },
  { name: "delivery-tracker", path: "/delivery-tracker", heading: "Delivery Tracker" },
  { name: "reports", path: "/reports", heading: "Operations Insights" },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} ${theme} screenshot for review`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { level: 1, name: screen.heading, exact: true })).toBeVisible();
      await expect(page.locator("tbody tr").first()).not.toContainText("Loading...");
      await page.screenshot({ path: `test-results/${screen.name}-${theme}.png`, fullPage: true });
    });
  }
}
