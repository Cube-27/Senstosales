// DataTable component tests (SPEC-14 §6, C8, INV-70, INV-71): header, body and pager keep their boxes across pages,
// a short last page, sorts and the loading, empty and error states. The page is ct/dist (built from ct/index.html),
// served to the browser from disk: no server runs.
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

import { expectNoLayoutShift, measure } from "../e2e/layout.ts";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "dist");
const ORIGIN = "http://ct.test";
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};

async function open(page: Page, theme: "light" | "dark" = "light"): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = normalize(join(DIST, path === "/" ? "index.html" : path));
    if (!file.startsWith(DIST + sep)) return route.fulfill({ status: 404 });
    await route.fulfill({
      body: await readFile(file),
      contentType: TYPES[extname(file)] ?? "application/octet-stream",
    });
  });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto(`${ORIGIN}/?theme=${theme}`);
  await expect(page.getByRole("table")).toBeVisible();
}

const parts = (page: Page) => {
  const table = page.getByRole("table");
  return {
    header: table.locator("thead"),
    body: table.locator("tbody"),
    pager: page.getByRole("navigation", { name: "Pagination" }),
    firstColumn: table.getByRole("columnheader").first(),
    lastColumn: table.getByRole("columnheader").last(),
  };
};

test.beforeEach(async ({ page }) => open(page));

test("page 1, the next page and the short last page keep every box", async ({ page }) => {
  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expectNoLayoutShift(page, parts(page), () => pager.getByRole("button", { name: "Next page" }).click());
  await expect(pager).toContainText("11-20");
  await expectNoLayoutShift(page, parts(page), () => pager.getByRole("button", { name: "Last page" }).click());
  await expect(pager).toContainText("21-23");
  await expectNoLayoutShift(page, parts(page), () => pager.getByRole("button", { name: "First page" }).click());
});

test("the short last page is padded to a full page of rows", async ({ page }) => {
  await page.getByRole("button", { name: "Last page" }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(10);
  expect(await page.locator("tbody tr[aria-hidden]").count()).toBe(7);
  expect((await page.locator("tbody").boundingBox())?.height).toBe(400);
});

test("sorting keeps every box", async ({ page }) => {
  const header = page.getByRole("columnheader", { name: "PO Number" });
  await expectNoLayoutShift(page, parts(page), () => header.getByRole("button").click());
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expectNoLayoutShift(page, parts(page), () => header.getByRole("button").click());
  await expect(header).toHaveAttribute("aria-sort", "descending");
});

for (const state of ["loading", "empty", "error"] as const) {
  test(`the ${state} state takes the footprint of the rows`, async ({ page }) => {
    await expectNoLayoutShift(page, parts(page), () => page.getByRole("button", { name: `Show ${state}` }).click());
    const text = { loading: "Loading...", empty: "No purchase orders found", error: "The server is not responding" };
    await expect(page.locator("tbody")).toHaveText(text[state]);
    await expectNoLayoutShift(page, parts(page), () => page.getByRole("button", { name: "Show ready" }).click());
  });
}

test("a page-size change resizes only the reserved body: header, columns and pager size stay", async ({ page }) => {
  const { header, firstColumn, lastColumn, pager } = parts(page);
  const before = await measure({ header, firstColumn, lastColumn });
  const pagerBefore = await pager.boundingBox();
  await pager.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "25" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  expect(await measure({ header, firstColumn, lastColumn })).toEqual(before);
  const pagerAfter = await pager.boundingBox();
  expect([pagerAfter?.x, pagerAfter?.width, pagerAfter?.height]).toEqual([
    pagerBefore?.x,
    pagerBefore?.width,
    pagerBefore?.height,
  ]);
  expect((await page.locator("tbody").boundingBox())?.height).toBe(1000);
});

test("a long cell is cut to one line with its full text in the title", async ({ page }) => {
  const cell = page.getByRole("cell", { name: /^Example Buyer 1 with/ });
  await expect(cell).toHaveAttribute("title", "Example Buyer 1 with a name far longer than its column");
  expect((await cell.boundingBox())?.height).toBe(40);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} screenshot for review`, async ({ page }) => {
    await open(page, theme);
    await page.locator("main").screenshot({ path: `test-results/datatable-${theme}.png` });
  });
}
