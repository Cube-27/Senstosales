// SPEC-15 PR 1 and 3: login and logout, INV-72 on the settings page, the BHEL password status (INV-81), password
// change ending other sessions (INV-80), and no layout shift on section toggles or validation errors (C8).
import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";
import { signIn } from "./session.ts";

test("signed out, a page goes to the login and back after signing in; Logout ends the session", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fsettings$/);
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Settings & Master Data" })).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("Save is enabled by a change, says why when disabled, saves and persists", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await expect(page.locator("#save-reason")).toHaveText("No changes to save");
  await page.getByLabel("Phone Number").fill("Example Phone");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator("#save-reason")).toHaveText("No changes to save");
  await page.reload();
  await expect(page.getByLabel("Phone Number")).toHaveValue("Example Phone");
});

test("leaving with unsaved changes asks first", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByLabel("Primary Email").fill("changed@example.com");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Unsaved changes" })).toBeVisible();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("section toggles and validation errors move neither Save nor the section switch", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  const fixed = {
    save: page.getByRole("button", { name: "Save", exact: true }),
    sections: page.getByRole("group", { name: "Settings sections" }),
    header: page.getByRole("heading", { name: "Settings & Master Data" }),
  };
  await expect(fixed.save).toBeVisible();
  for (const name of ["System Defaults", "Buyer Management", "Supplier Profile"]) {
    await expectNoLayoutShift(page, fixed, () => page.getByRole("button", { name }).click());
  }
  await page.getByRole("button", { name: "System Defaults" }).click();
  const cgst = page.getByLabel("CGST %");
  await expectNoLayoutShift(page, { ...fixed, cgst, sgst: page.getByLabel("SGST %") }, async () => {
    await cgst.fill("nine");
    await expect(page.getByText('Not a decimal number: "nine"')).toBeVisible();
  });
});

test("the BHEL password shows only as saved and never comes back to the page", async ({ page }) => {
  const secret = "portal-secret-e2e";
  const bodies: Array<Promise<string>> = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/")) bodies.push(res.text().catch(() => ""));
  });
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "System Defaults" }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByLabel("BHEL Portal Password").fill(secret);
  await page.getByLabel("BHEL Portal Password").press("Enter");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "System Defaults" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(secret);
  expect((await Promise.all(bodies)).filter((body) => body.includes(secret))).toEqual([]);
});

test("changing the password ends the other sessions", async ({ page, browser, server }) => {
  const other = await browser.newContext({ baseURL: server.url });
  const otherPage = await other.newPage();
  await signIn(otherPage);
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "System Defaults" }).click();
  await page.getByLabel("Current Password").first().fill("admin");
  await page.getByLabel("New Password", { exact: true }).fill("changed");
  await page.getByLabel("Confirm New Password").fill("changed");
  await page.getByRole("button", { name: "Change Password" }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await (await otherPage.request.get("/api/auth/session")).json()).toMatchObject({ authenticated: false });
  await other.close();
  // Put the default back for the specs that sign in with it.
  const reset = await page.request.post("/api/auth/reset-defaults", {
    data: { confirmation: "RESET TO DEFAULTS", currentPassword: "changed" },
  });
  expect(reset.ok()).toBe(true);
});
