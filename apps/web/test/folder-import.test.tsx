// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type Call, renderApp, stubApi } from "./app.tsx";

const picked = vi.hoisted(() => ({ files: [] as File[] }));
vi.mock("../src/platform/index.ts", () => ({
  getPlatform: async () => ({ pickFiles: async () => null, pickFolder: async () => picked.files }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const JOB_PO = "01J00000000000000000000051";
const JOB_SRV = "01J00000000000000000000052";
const STAGING = "01J00000000000000000000053";

const page = (name: string) => new File(["<html></html>"], name, { type: "text/html" });

const job = (over: Record<string, unknown> = {}) => ({
  id: JOB_PO,
  type: "po.import-folder",
  status: "running",
  createdAt: "2025-03-01T10:00:00.000Z",
  startedAt: "2025-03-01T10:00:00.000Z",
  finishedAt: null,
  cancelRequested: false,
  progress: { total: 3, done: 1, skipped: 0, failed: 0, current: "po-2.html" },
  error: null,
  summary: null,
  ...over,
});

const finished = (over: Record<string, unknown> = {}) =>
  job({
    status: "done",
    finishedAt: "2025-03-01T10:01:00.000Z",
    progress: { total: 3, done: 1, skipped: 1, failed: 1, current: null },
    summary: {
      total: 3,
      done: 1,
      skipped: 1,
      failed: 1,
      skippedDocuments: [{ document: "po-1.html", reason: "An equal or newer copy is stored" }],
      failedDocuments: [{ document: "po-3.html", reason: "Not a BHEL PO page" }],
      flags: { QTY_MISMATCH: 2, OVER_DISPATCH: 0 },
    },
    ...over,
  });

/** Opens the folder import where the legacy sync folder control was: the PO list's More menu. */
async function openImport() {
  const { queryClient } = renderApp("/po");
  fireEvent.click(await screen.findByRole("button", { name: "More" }));
  fireEvent.click(await screen.findByRole("button", { name: "Import Folders" }));
  await screen.findByRole("dialog", { name: "Import Folders" });
  return queryClient;
}

/** The job polls: each `jobs.detail` call answers with the next state, the last one repeated. */
function jobApi(states: Record<string, unknown[]>, extra: Parameters<typeof stubApi>[0] = {}): Call[] {
  const seen: Record<string, number> = {};
  const detail = (id: string) => () => {
    const list = states[id] ?? [];
    const n = seen[id] ?? 0;
    seen[id] = n + 1;
    return { job: list[Math.min(n, list.length - 1)], events: [] };
  };
  return stubApi({
    "GET /api/po": () => ({ items: [], total: 0 }),
    "GET /api/po/stats": () => ({ count: 0, poValue: "0", dspQty: "0", rejQty: "0" }),
    "POST /api/jobs/staging": () => ({ stagingId: STAGING, count: 2 }),
    "POST /api/jobs": (call) =>
      (call.body as { type: string }).type === "po.import-folder" ? job() : job({ id: JOB_SRV }),
    [`GET /api/jobs/${JOB_PO}`]: detail(JOB_PO),
    [`GET /api/jobs/${JOB_SRV}`]: detail(JOB_SRV),
    ...extra,
  });
}

describe("FolderImport and JobProgress (SPEC-16 PR 5)", () => {
  it("stages the folder's HTML pages, starts the PO import and shows its progress", async () => {
    picked.files = [page("po-1.html"), page("po-2.HTM"), page("notes.txt")];
    const calls = jobApi({ [JOB_PO]: [job()] });
    await openImport();
    const po = within(screen.getByRole("region", { name: "PO folder" }));
    fireEvent.click(po.getByRole("button", { name: "Choose PO folder" }));
    expect(await po.findByText("Current: po-2.html")).toBeTruthy();
    expect(po.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
    const staged = calls.find((c) => c.path === "/api/jobs/staging")?.body as { kind: string; files: unknown[] };
    expect([staged.kind, staged.files.length]).toEqual(["po", 2]);
    expect(calls.find((c) => c.path === "/api/jobs")?.body).toEqual({ type: "po.import-folder", stagingId: STAGING });
    // SRVs wait while the PO import runs.
    expect(screen.getByRole("button", { name: "Choose SRV folder" }).hasAttribute("disabled")).toBe(true);
  });

  it("polls every 2 s and, when the job ends, shows skipped and failed files with reasons and flags by type", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    picked.files = [page("po-1.html")];
    const calls = jobApi({ [JOB_PO]: [job(), finished()] });
    const queryClient = await openImport();
    const refreshed = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Choose PO folder" }));
    await screen.findByText("Current: po-2.html");
    const polls = () => calls.filter((c) => c.path === `/api/jobs/${JOB_PO}`).length;
    expect(polls()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(await screen.findByText("Import Complete")).toBeTruthy();
    expect(polls()).toBe(2);
    const issues = within(screen.getByRole("list", { name: "Files not imported" }));
    expect(issues.getByText("po-1.html").nextElementSibling?.textContent).toBe("An equal or newer copy is stored");
    expect(issues.getByText("po-3.html").nextElementSibling?.textContent).toBe("Not a BHEL PO page");
    expect(screen.getByText("Flags raised: QTY MISMATCH 2")).toBeTruthy();
    // The lists behind refresh with what the import stored.
    expect(refreshed).toHaveBeenCalledOnce();
    // An ended job is not polled again.
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(polls()).toBe(2);
    // Then the SRV folder.
    picked.files = [page("srv-1.html")];
    fireEvent.click(screen.getByRole("button", { name: "Choose SRV folder" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === "/api/jobs").map((c) => (c.body as { type: string }).type)).toEqual([
        "po.import-folder",
        "srv.import-folder",
      ]),
    );
  });

  it("cancels a running job", async () => {
    picked.files = [page("po-1.html")];
    let cancelled = false;
    const calls = jobApi(
      { [JOB_PO]: [job()] },
      {
        [`GET /api/jobs/${JOB_PO}`]: () => ({ job: job({ cancelRequested: cancelled }), events: [] }),
        [`POST /api/jobs/${JOB_PO}/cancel`]: () => {
          cancelled = true;
          return job({ cancelRequested: true });
        },
      },
    );
    await openImport();
    fireEvent.click(screen.getByRole("button", { name: "Choose PO folder" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Cancelling...")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST" && c.path === `/api/jobs/${JOB_PO}/cancel`)).toBe(true);
  });

  it("says so when the folder has no HTML pages, and starts nothing", async () => {
    picked.files = [page("notes.txt")];
    const calls = jobApi({});
    await openImport();
    fireEvent.click(screen.getByRole("button", { name: "Choose PO folder" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No HTML files found in this folder.");
    expect(calls.filter((c) => c.path.startsWith("/api/jobs"))).toEqual([]);
  });
});
