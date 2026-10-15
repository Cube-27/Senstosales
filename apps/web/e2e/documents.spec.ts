// SPEC-18 end to end: a synthetic PO, a DC over its pending quantity, the DC's invoice, their downloads, then the SRV
// that links both. The tests share one API of their own (the `documents` dataset) and run in order.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";
import { signIn } from "./session.ts";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/parsers/fixtures");
// PO 4100000101: item 10, 10 ordered at 1250. The SRV receives challan 17 and invoice 17 of 01/07/2023 against it.
const PO_PAGE = resolve(FIXTURES, "po", "era1-single-item.html");
const SRV_PAGE = resolve(FIXTURES, "srv", "layout-a-single.html");
const ULID = "[0-9A-Z]{26}";

test.use({ dataset: "documents" });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function typeDate(page: Page, label: string, text: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(text);
  await page.getByLabel(label, { exact: true }).press("Enter");
}

/** The PO page's id, read from the list's link. */
async function openPo(page: Page): Promise<string> {
  await page.goto("/po");
  await page.getByRole("link", { name: "4100000101", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/po/${ULID}$`));
  return page.url().split("/").at(-1) ?? "";
}

/** Fills and saves a DC on the PO; returns on its page. */
async function createDc(page: Page, poId: string, number: string, date: string, qty: string): Promise<void> {
  await page.goto(`/dc/create?po=${poId}`);
  await page.getByLabel("DC Number").fill(number);
  await typeDate(page, "DC Date*", date);
  await page.getByLabel("Consignee").fill("Example Consignee Unit");
  await page.getByLabel("Dispatch qty of item 10").fill(qty);
  await expect(page.getByRole("button", { name: "Save DC" })).toBeEnabled();
  await page.getByRole("button", { name: "Save DC" }).click();
  await page.getByRole("button", { name: "Generate DC" }).click();
  await expect(page).toHaveURL(new RegExp(`/dc/${ULID}$`));
}

/** Number 17's link to its own page, beside the other document 17 the list links. */
const link17 = (page: Page, kind: "dc" | "invoice") =>
  page.getByRole("link", { name: "17", exact: true }).and(page.locator(`[href^="/${kind}/"]`));

async function downloads(page: Page, button: string): Promise<string> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  return (await download).suggestedFilename();
}

test("uploads the PO and saves a DC over its pending quantity; the PO shows the flag (INV-32, C6)", async ({
  page,
}) => {
  const html = await readFile(PO_PAGE, "utf8");
  const res = await page.request.post("/api/po/upload", { data: { files: [{ name: "po.html", html }] } });
  expect(res.ok()).toBe(true);
  const poId = await openPo(page);
  // 12 against 10 ordered: saved, then flagged (A-7).
  await createDc(page, poId, "17", "01/07/2023", "12");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/17/);
  await openPo(page);
  await expect(page.getByText("OVER DISPATCH", { exact: true })).toBeVisible();
});

test("downloads the DC and GC, then invoices the DC with its lines locked (INV-29, INV-41)", async ({ page }) => {
  await page.goto("/dc");
  await link17(page, "dc").click();
  expect(await downloads(page, "DC")).toMatch(/\.xlsx$/);
  expect(await downloads(page, "GC")).toMatch(/\.xlsx$/);
  await page.getByRole("link", { name: "Create Invoice" }).click();
  await expect(page).toHaveURL(/\/invoice\/create\?dc=/);
  await expect(page.getByLabel("Buyer Address")).toBeVisible();
  // DC-sourced: the DC's qty and the PO rate, with no field to change them.
  await expect(page.getByLabel("Invoice qty of item 10")).toHaveCount(0);
  await page.getByLabel("Invoice No.").fill("17");
  await typeDate(page, "Dated*", "01/07/2023");
  const totals = page.getByRole("region", { name: "Totals" });
  await expect(totals).toContainText("₹17,700");
  await page.getByRole("button", { name: "Save Invoice" }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invoice/${ULID}$`));
  // The stored totals are the ones the form showed.
  await expect(page.getByRole("cell", { name: "₹17,700" })).toBeVisible();
  expect(await downloads(page, "Download")).toMatch(/\.xlsx$/);
});

test("a taken invoice number in the same FY is refused in place (INV-22)", async ({ page }) => {
  const poId = await openPo(page);
  await createDc(page, poId, "18", "02/07/2023", "1");
  await page.getByRole("link", { name: "Create Invoice" }).click();
  await page.getByLabel("Invoice No.").fill("17");
  await typeDate(page, "Dated*", "02/07/2023");
  await page.getByRole("button", { name: "Save Invoice" }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toHaveText(
    "Invoice 17 already exists in FY 2023-24.",
  );
  await expect(page.getByText("Duplicate number")).toBeVisible();
  await expect(page).toHaveURL(/\/invoice\/create\?dc=/);
});

test("the SRV upload links the DC and the invoice, whose delete is then disabled with the reason (INV-35, INV-37)", async ({
  page,
}) => {
  await page.goto("/srv");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await (await chooser).setFiles(SRV_PAGE);
  await expect(page.getByText("Upload Complete")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await page.goto("/dc");
  await link17(page, "dc").click();
  await expect(page.getByRole("link", { name: "5000101", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "DC linked to invoice cannot be deleted" })).toBeDisabled();
  await page.goto("/invoice");
  await link17(page, "invoice").click();
  await expect(page.getByRole("link", { name: "5000101", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invoice linked to SRV cannot be deleted" })).toBeDisabled();
});

test("adding a note or a quantity grows only its own section (C8)", async ({ page }) => {
  // Tall enough that clicking scrolls nothing: a scroll would read as a shift.
  await page.setViewportSize({ width: 1280, height: 1600 });
  const poId = await openPo(page);
  await page.goto(`/dc/create?po=${poId}`);
  const header = page.getByRole("region", { name: "Challan Details" });
  const items = page.getByRole("region", { name: "Items to Dispatch" });
  await expectNoLayoutShift(page, { header, items }, () => page.getByRole("button", { name: "Add Note" }).click());
  await page.goto(`/invoice/create?po=${poId}`);
  const details = page.getByRole("region", { name: "Invoice Details" });
  const lines = page.getByRole("region", { name: "Line Items" });
  const totals = page.getByRole("region", { name: "Totals" });
  await expectNoLayoutShift(page, { details, lines, totals }, () =>
    page.getByLabel("Invoice qty of item 10").fill("3"),
  );
  await expect(totals).toContainText("₹4,425");
});
