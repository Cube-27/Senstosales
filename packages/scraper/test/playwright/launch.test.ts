import type { Browser, BrowserType } from "playwright-core";
import { describe, expect, it } from "vite-plus/test";

import { ScraperError } from "../../src/port.ts";
import { launchEdge } from "../../src/platform/playwright/launch.ts";

type Calls = { launch: unknown[]; newContext: unknown[]; closed: number };

/** A browser type that records its options; `fail` makes that call throw as a missing or blocked Edge would. */
function fakeBrowserType(fail?: "launch" | "newContext"): { browserType: Pick<BrowserType, "launch">; calls: Calls } {
  const calls: Calls = { launch: [], newContext: [], closed: 0 };
  const page = { kind: "page" };
  const browser = {
    async newContext(options: unknown) {
      calls.newContext.push(options);
      if (fail === "newContext") throw new Error("context failed");
      return { newPage: async () => page };
    },
    async close() {
      calls.closed += 1;
    },
  } as unknown as Browser;
  return {
    calls,
    browserType: {
      async launch(options?: unknown) {
        calls.launch.push(options);
        if (fail === "launch") throw new Error("Chromium distribution 'msedge' is not found");
        return browser;
      },
    },
  };
}

describe("launchEdge", () => {
  it("passes only channel, headless and the user agent (INV-86)", async () => {
    const { browserType, calls } = fakeBrowserType();
    const edge = await launchEdge(browserType);
    expect(edge.page).toEqual({ kind: "page" });
    expect(calls.launch).toEqual([{ channel: "msedge", headless: true }]);
    expect(calls.newContext).toEqual([
      {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      },
    ]);
  });

  it("maps a failed launch to edge-unavailable with the EC-09 message and no launch detail", async () => {
    const error = await launchEdge(fakeBrowserType("launch").browserType).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScraperError);
    expect((error as ScraperError).code).toBe("edge-unavailable");
    expect((error as ScraperError).message).toBe(
      "BHEL sync needs Microsoft Edge, which could not be started. Folder import still works.",
    );
  });

  it("closes the browser and answers edge-unavailable when its page cannot be opened", async () => {
    const { browserType, calls } = fakeBrowserType("newContext");
    const error = await launchEdge(browserType).catch((e: unknown) => e);
    expect((error as ScraperError).code).toBe("edge-unavailable");
    expect(calls.closed).toBe(1);
  });
});
