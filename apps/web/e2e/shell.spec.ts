// The harness end to end: the API on a temp data folder serves the built SPA, and the shell holds still.
import { expect, test } from "./fixtures.ts";
import { expectNoLayoutShift } from "./layout.ts";

test("the API answers its health check on loopback", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
});

test("the onboarded dataset needs no onboarding", async ({ request }) => {
  expect(await (await request.get("/api/onboarding")).json()).toEqual({ required: false });
});

test("the shell serves every screen and the theme switch moves nothing", async ({ page }) => {
  await page.goto("/po");
  const sidebar = page.getByRole("complementary", { name: "Main navigation" });
  await expect(sidebar.getByRole("link", { name: "Purchase Orders" })).toBeVisible();
  await expectNoLayoutShift(page, { sidebar, header: page.locator("header"), main: page.locator("main") }, () =>
    page.getByRole("button", { name: "Dark mode" }).click(),
  );
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});
