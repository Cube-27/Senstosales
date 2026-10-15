// SPEC-16 end to end: folder import of synthetic PO and SRV pages, then the PO and SRV screens over what it stored.
// The tests share one API (worker scope) and run in order: the import loads the data the later tests read.
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/parsers/fixtures");

/** A temp folder holding copies of the named parser fixtures (synthetic BHEL pages). */
async function folder(kind: "po" | "srv", names: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `sensto-e2e-${kind}-`));
  await Promise.all(names.map((name) => copyFile(join(FIXTURES, kind, name), join(dir, name))));
  return dir;
}

async function chooseFolder(page: Page, button: string, dir: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(dir);
}

// The onboarded dataset keeps the default password; the session cookie lands in the page's context.
test.beforeEach(async ({ page }) => {
  const res = await page.request.post("/api/auth/login", { data: { password: "admin", rememberMe: false } });
  expect(res.ok()).toBe(true);
});

test("imports a PO folder, then an SRV folder, with progress and a summary in one footprint", async ({ page }) => {
  const poDir = await folder("po", ["era1-single-item.html", "era2-multi-item.html"]);
  const srvDir = await folder("srv", ["layout-a-single.html", "multi-item.html"]);
  try {
    await page.goto("/po");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Import Folders" }).click();
    const dialog = page.getByRole("dialog", { name: "Import Folders" });
    const po = dialog.getByRole("region", { name: "PO folder" });
    const srv = dialog.getByRole("region", { name: "SRV folder" });
    await expectNoLayoutShift(page, { po, srv }, async () => {
      await chooseFolder(page, "Choose PO folder", poDir);
      await expect(po.getByText("Import Complete")).toBeVisible({ timeout: 30_000 });
    });
    await expect(po.getByText("2 / 2")).toBeVisible();
    await chooseFolder(page, "Choose SRV folder", srvDir);
    await expect(srv.getByText("Import Complete")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "4100000101", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "4100000102", exact: true })).toBeVisible();
  } finally {
    await Promise.all([rm(poDir, { recursive: true }), rm(srvDir, { recursive: true })]);
  }
});

test("the PO list's status filter moves nothing, and a PO opens with its items", async ({ page }) => {
  await page.goto("/po");
  const table = page.locator("table").first();
  await expect(page.getByRole("link", { name: "4100000101", exact: true })).toBeVisible();
  await expectNoLayoutShift(page, { table, toolbar: page.getByRole("button", { name: "More", exact: true }) }, () =>
    page.getByRole("button", { name: "Pending", exact: true }).click(),
  );
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  await page.getByRole("link", { name: "4100000102", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/4100000102/);
  await expect(page.getByRole("cell", { name: "#10", exact: true })).toBeVisible();
});

test("creates a PO by hand and opens it", async ({ page }) => {
  await page.goto("/po/create");
  await page.getByLabel("PO Number").fill("4100000901");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Description of item 1").fill("Synthetic flange");
  await page.getByLabel("Code of item 1").fill("SYN900010");
  await page.getByLabel("Unit of item 1").fill("NOS");
  await page.getByLabel("Qty of item 1").fill("4");
  await page.getByLabel("Rate of item 1").fill("250");
  await page.getByRole("button", { name: "Save PO" }).click();
  await page.getByRole("button", { name: "Create PO" }).click();
  await expect(page).toHaveURL(/\/po\/[0-9A-Z]{26}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/4100000901/);
});

test("lists SRVs flat and by PO, opens one, and deletes it", async ({ page }) => {
  await page.goto("/srv");
  await expect(page.getByRole("link", { name: "5000101", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PO View" }).click();
  await expect(page.getByText("Total POs")).toBeVisible();
  await page.getByRole("button", { name: "SRV View" }).click();
  await page.getByRole("link", { name: "5000101", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("5000101");
  await expect(page.getByRole("region", { name: "Receipt Details" })).toBeVisible();
  await page.goto("/srv");
  await page.getByRole("button", { name: "Delete SRV 5000101" }).click();
  await page.getByRole("button", { name: "Delete SRV", exact: true }).click();
  await expect(page.getByRole("link", { name: "5000101", exact: true })).toHaveCount(0);
});
