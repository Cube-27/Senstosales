// SPEC-15 PR 4 and 5: the dashboard's legacy cards and period switch, and the search dialog keeping its size while
// results load and its panels open (C8).
import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";
import { signIn } from "./session.ts";

test("the dashboard shows the legacy cards and switching the period moves nothing", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  const summary = page.getByRole("region", { name: "Page summary" });
  for (const label of ["PO Value", "Invoiced", "Lead Time", "Overdue"]) {
    await expect(summary.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("SRVs with deviations detected")).toBeVisible();
  const around = {
    summary,
    activity: page.getByRole("region", { name: "Recent Activity" }),
    funnel: page.getByRole("region", { name: "Supply Chain Funnel" }),
  };
  await expectNoLayoutShift(page, around, async () => {
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("Supply chain overview - All")).toBeVisible();
  });
});

test("the search dialog keeps its size while searching and when its panels open", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Search\.\.\./ }).click();
  const dialog = page.getByRole("dialog", { name: "Quick Search" });
  await expect(dialog.getByText("Type to search")).toBeVisible();
  const frame = { dialog, box: dialog.getByRole("textbox", { name: /Search POs/ }) };
  await expectNoLayoutShift(page, frame, async () => {
    await frame.box.fill("4500");
    await expect(dialog.getByText("No results found")).toBeVisible();
  });
  await expectNoLayoutShift(page, frame, () => dialog.getByRole("button", { name: "Toggle filters" }).click());
  await expectNoLayoutShift(page, frame, () => dialog.getByRole("button", { name: "Saved searches" }).click());
});
