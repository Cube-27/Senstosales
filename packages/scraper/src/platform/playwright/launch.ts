// Starts the system Edge through playwright-core (INV-86): headless, no bundled browser, and no flags beyond a fixed
// user agent; never `--disable-web-security`. Any launch failure means Edge is missing or blocked (EC-09).
import type { Browser, BrowserType, Page } from "playwright-core";

import { ScraperError } from "../../port.ts";

/** The user agent of the browser and of the HTTP session that reuses its cookies. */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";

export type Edge = { readonly browser: Browser; readonly page: Page };

/** Opens Edge with one page. Rejects with `edge-unavailable` when Edge cannot be started. playwright-core is loaded on
 * the first launch, so the app starts without it. */
export async function launchEdge(browserType?: Pick<BrowserType, "launch">): Promise<Edge> {
  let browser: Browser;
  try {
    const type = browserType ?? (await import("playwright-core")).chromium;
    browser = await type.launch({ channel: "msedge", headless: true });
  } catch {
    throw new ScraperError("edge-unavailable");
  }
  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    return { browser, page: await context.newPage() };
  } catch {
    await browser.close().catch(() => {});
    throw new ScraperError("edge-unavailable");
  }
}
