// @vitest-environment jsdom
// SPEC-19 PR 5: the tray tooltip names the running job (ARCHITECTURE §7.3, §12.4), from `/api/health`.
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { followJobInTray } from "../src/lib/tray.ts";
import { stubApi } from "./app.tsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const health = (job: { type: string; status: string } | null) => ({
  version: "0.1.0",
  schemaVersion: 1,
  job: job && { id: "01J000000000000000000000JB", ...job },
});

describe("tray status (SPEC-19 PR 5)", () => {
  it("shows the running job, then the app name once it ends, setting each text once; polls slower while idle", async () => {
    vi.useFakeTimers();
    let current = health({ type: "po.scrape", status: "running" });
    stubApi({ "GET /api/health": () => current });
    const texts: string[] = [];
    const stop = followJobInTray(new QueryClient(), async (text) => {
      texts.push(text);
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(texts).toEqual(["SenstoSales: BHEL PO sync running"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(texts).toEqual(["SenstoSales: BHEL PO sync running"]);

    current = health({ type: "backup", status: "queued" });
    await vi.advanceTimersByTimeAsync(2000);
    current = health(null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(texts).toEqual(["SenstoSales: BHEL PO sync running", "SenstoSales: Backup waiting", "SenstoSales"]);

    // With no job it looks every 10 s, not every 2 s.
    current = health({ type: "recompute-all", status: "running" });
    await vi.advanceTimersByTimeAsync(8000);
    expect(texts).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(texts.at(-1)).toBe("SenstoSales: Recalculation running");

    stop();
    current = health({ type: "srv.import-folder", status: "running" });
    await vi.advanceTimersByTimeAsync(4000);
    expect(texts).toHaveLength(4);
  });

  it.each([
    ["po.scrape", "SenstoSales: BHEL PO sync running"],
    ["srv.scrape", "SenstoSales: BHEL SRV sync running"],
    ["po.import-folder", "SenstoSales: PO folder import running"],
    ["srv.import-folder", "SenstoSales: SRV folder import running"],
    ["recompute-all", "SenstoSales: Recalculation running"],
    ["backup", "SenstoSales: Backup running"],
  ])("names %s in plain words", async (type, text) => {
    stubApi({ "GET /api/health": health({ type, status: "running" }) });
    const texts: string[] = [];
    const stop = followJobInTray(new QueryClient(), async (t) => {
      texts.push(t);
    });
    await vi.waitFor(() => expect(texts).toEqual([text]));
    stop();
  });
});
