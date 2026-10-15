// Playwright for the web app (SPEC-14 §2, ARCHITECTURE §14.1): `e2e/` drives the built SPA served by the API on a
// temp data folder; `ct/` measures shared components on a page built from ct/index.html. Always headless, on the
// Edge every Windows machine has, one worker, plain list output: nothing opens a window or a report server.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
  use: { channel: "msedge", headless: true, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "e2e", testDir: "e2e" },
    { name: "ct", testDir: "ct" },
  ],
});
