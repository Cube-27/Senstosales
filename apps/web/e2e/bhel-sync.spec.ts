// SPEC-19 PR 5: captcha → OTP → progress → summary over the fake scraper the e2e API runs (apps/api/test/e2e-server.ts),
// with no layout shift between the wizard's steps or when the run starts (SPEC-19 §7, C8).
import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";
import { signIn } from "./session.ts";

test.use({ dataset: "bhel-sync" });

test("captcha, OTP, Start: the run shows its progress and summary and ingests the POs", async ({ page }) => {
  await signIn(page);
  const saved = await page.request.put("/api/settings/bhel-password", { data: { password: "portal-pass-e2e" } });
  expect(saved.ok()).toBe(true);
  await page.goto("/po/ingest-bhel");
  await expect(page.getByLabel("Supplier Code")).toHaveValue("TEST-001");

  await page.getByRole("button", { name: "Login to BHEL" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Enter CAPTCHA" })).toBeVisible();
  const box = { dialog, footer: dialog.getByRole("button", { name: "Cancel" }) };

  await expectNoLayoutShift(page, box, async () => {
    await dialog.getByLabel("CAPTCHA code").fill("WRONG");
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(dialog.getByRole("alert")).not.toBeEmpty();
  });
  await expectNoLayoutShift(page, box, async () => {
    await dialog.getByLabel("CAPTCHA code").fill("AB12C");
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(dialog.getByRole("heading", { name: "Enter OTP" })).toBeVisible();
  });
  await dialog.getByLabel("OTP code").fill("123456");
  await dialog.getByRole("button", { name: "Submit OTP" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Authenticated")).toBeVisible();

  await page.getByLabel("Batch Limit").fill("3");
  const fixed = {
    pipeline: page.getByRole("region", { name: "Pipeline Configuration" }),
    footer: page.getByText("Single Active Pipeline Per Session"),
    start: page.getByRole("button", { name: /Start|Running/ }),
  };
  await expectNoLayoutShift(page, fixed, async () => {
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("heading", { name: "Done" })).toBeVisible({ timeout: 30_000 });
  });
  await expect(page.getByRole("progressbar", { name: "Job progress" })).toHaveAttribute("aria-valuenow", "100");
  // 4500003 is listed but its page cannot be fetched: it fails alone, the other two are ingested.
  await expect(page.getByRole("list", { name: "Files not imported" })).toContainText("4500003");
  await expect(page.getByRole("button", { name: "Login to BHEL" })).toBeVisible();

  await page.goto("/po");
  await expect(page.getByRole("link", { name: "4500001", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "4500002", exact: true })).toBeVisible();
});
