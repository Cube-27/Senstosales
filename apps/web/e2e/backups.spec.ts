// SPEC-21 PR 3: Backup now and Restore from Settings in web mode, without layout shift (C8). Restore takes back the
// copy Backup now just made, so the data and the session this worker's other specs use stay as they were.
import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";
import { signIn } from "./session.ts";

test("Backup now saves a manual copy, and Restore brings it back and reloads", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "System Defaults" }).click();
  const panel = page.getByRole("region", { name: "Backups" });
  const status = panel.getByRole("status");
  const backupNow = panel.getByRole("button", { name: "Backup now" });
  await expect(panel.getByRole("row")).not.toHaveCount(1);
  const fixed = {
    backupNow,
    sections: page.getByRole("group", { name: "Settings sections" }),
    table: panel.getByRole("table"),
    pager: panel.getByRole("navigation"),
  };

  await expectNoLayoutShift(page, fixed, async () => {
    await backupNow.click();
    await expect(status).toHaveText("Backup saved.");
  });
  // Its own file beside the daily copy, never in place of it.
  const copy = panel.getByRole("row").filter({ hasText: /manual-\d{8}T\d{6}Z\.db/ });
  await expect(copy).toHaveCount(1);
  await expect(copy).toContainText("Manual");

  await copy.getByRole("button", { name: "Restore" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Your current data will be replaced by manual-\d{8}T\d{6}Z\.db\./);
  const reloaded = page.waitForEvent("load");
  await dialog.getByRole("button", { name: "Restore" }).click();
  await reloaded;
  await expect(page.getByRole("heading", { name: "Settings & Master Data" })).toBeVisible();
  await page.getByRole("button", { name: "System Defaults" }).click();
  await expect(panel.getByRole("row").filter({ hasText: /^safety-/ })).not.toHaveCount(0);
});
