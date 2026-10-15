// SPEC-15 §7: light and dark screenshots of the login, settings and dashboard, as review artefacts (CI uploads
// `test-results/`). Each screen is checked for one of its legacy headings first, so a blank page fails.
import { expect, test } from "./fixtures.ts";
import { signIn } from "./session.ts";

const SCREENS = [
  { name: "login", path: "/auth/login", heading: "Local Access", signedIn: false },
  { name: "settings", path: "/settings", heading: "Settings & Master Data", signedIn: true },
  { name: "dashboard", path: "/", heading: "Dashboard", signedIn: true },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} ${theme} screenshot for review`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      if (screen.signedIn) await signIn(page);
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible();
      await page.screenshot({ path: `test-results/${screen.name}-${theme}.png`, fullPage: true });
    });
  }
}
