// SPEC-15 PR 1 and 2 (§14.1): fresh data folder -> onboarding -> login -> dashboard; afterwards onboarding
// redirects away.
import { expect, test } from "./fixtures.ts";

test.use({ dataset: "fresh" });

test("first run: onboarding, then the login, then the dashboard", async ({ page }) => {
  await page.goto("/po");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Registered Entity Name").fill("Example Works");
  await page.getByLabel("Primary Email").fill("accounts@example.com");
  await page.getByRole("button", { name: "Save and Continue" }).click();

  await expect(page).toHaveURL(/\/auth\/login/);
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});
