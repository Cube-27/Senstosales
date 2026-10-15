// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { type Call, fileReply, renderApp, signedIn, stubApi } from "./app.tsx";
import { captureDownloads } from "./downloads.ts";

// Today is 2025-06-01 in IST; only `Date` is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2025-06-01T06:00:00.000Z") });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const id = (tag: string): string => `01J${"0".repeat(23 - tag.length)}${tag}`;

const doc = (tag: string, number: string) => ({ id: id(tag), number, date: "2025-05-10", financialYear: "2025-26" });

const item = (tag: string, po: string, over: Record<string, unknown> = {}) => ({
  poId: id(`P${po}`),
  poItemId: id(`N${tag}`),
  poNumber: `450000${po}`,
  poDate: "2025-05-31",
  poItemNo: 10,
  description: `Item ${tag}`,
  ordQty: "10",
  dspQty: "4",
  ...over,
});

const PENDING = [
  item("1", "1", { unit: "NOS", gemcNumbers: ["GEMC-1"], dcs: [doc("D1", "101"), doc("D2", "102")], invoices: [] }),
  item("2", "1", { poItemNo: 20, unit: "NOS", gemcNumbers: [], dcs: [], invoices: [doc("V1", "201")] }),
  item("3", "2", { unit: null, gemcNumbers: [], dcs: [], invoices: [] }),
];
const RECONCILIATION = [item("1", "1", { rcdQty: "3", rejQty: "1", balanceQty: "6" })];
const DISPATCH = [
  {
    dcItemId: id("E1"),
    dcId: id("D1"),
    dcNumber: "101",
    dcDate: "2025-06-01",
    poId: id("P1"),
    poNumber: "4500001",
    poItemNo: 10,
    description: "Item 1",
    unit: "Nos",
    dspQty: "40",
    packets: 2,
    gemcNumber: "GEMC-1",
    invoiceNumber: "201",
    departmentNo: "456",
  },
  {
    dcItemId: id("E2"),
    dcId: id("D2"),
    dcNumber: "102",
    dcDate: "2025-06-01",
    poId: id("P2"),
    poNumber: "4500002",
    poItemNo: 10,
    description: "Item 3",
    unit: null,
    dspQty: "1",
    packets: null,
    gemcNumber: null,
    invoiceNumber: null,
    departmentNo: null,
  },
];

function reportsApi() {
  return stubApi({
    ...signedIn(true),
    "GET /api/reports/pending": { items: PENDING, total: 3 },
    "GET /api/reports/reconciliation": { items: RECONCILIATION, total: 1 },
    "GET /api/reports/daily-dispatch": { items: DISPATCH, total: 2 },
    "GET /api/reports/daily-dispatch/export": fileReply("Daily_Dispatch_2025-05-31_to_2025-06-01.xlsx"),
    "GET /api/reports/pending/export": fileReply("Items_Summary_2025-05-31_to_2025-06-01.xlsx"),
    "GET /api/reports/reconciliation/export": fileReply("PO_Reconciliation_Report.xlsx"),
    "POST /api/reports/export-selected": fileReply("PO_Reconciliation_Report.xlsx"),
  });
}

const last = (calls: Call[], route: string) => calls.filter((c) => c.route === route).at(-1)?.url.searchParams;
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1] as HTMLElement).getAllByRole("row");
const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent);

describe("reports (SPEC-17 PR 4)", () => {
  it("opens on Items Summary for yesterday to today, with the legacy columns", async () => {
    const calls = reportsApi();
    renderApp("/reports");
    expect(await screen.findByRole("heading", { level: 1, name: "Operations Insights" })).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "Report" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Items Summary", "Audit Ledger", "Daily Dispatch"]);
    await screen.findByText("Item 1");
    const sent = last(calls, "GET /api/reports/pending");
    expect([sent?.get("from"), sent?.get("to")]).toEqual(["2025-05-31", "2025-06-01"]);
    expect(headers()).toEqual([
      "",
      "Material",
      "Qty",
      "Packets",
      "PO #",
      "GEMC #",
      "Invoice #",
      "Challan #",
      "Received",
    ]);
    expect(
      bodyRows().map((r) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ["", "Item 1", "10", "0", "4500001", "GEMC-1", "-", "101, 102", "4"],
      ["", "Item 2", "10", "0", "4500001", "-", "201", "-", "4"],
      ["", "Item 3", "10", "0", "4500002", "-", "-", "-", "4"],
    ]);
    expect(
      within(bodyRows()[0] as HTMLElement)
        .getByRole("link", { name: "102" })
        .getAttribute("href"),
    ).toBe(`/dc/${id("D2")}`);
  });

  it("switches to Audit Ledger with its columns and the same range", async () => {
    const calls = reportsApi();
    renderApp("/reports");
    await screen.findByText("Item 1");
    await userEvent.click(screen.getByRole("button", { name: "Audit Ledger" }));
    await screen.findByText("4500001");
    expect(headers()).toEqual(["", "PO Number", "Material", "Ordered", "Delivered", "Received", "Rejected"]);
    expect(
      within(bodyRows()[0] as HTMLElement)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["", "4500001", "Item 1", "10", "4", "3", "1"]);
    expect(last(calls, "GET /api/reports/reconciliation")?.get("from")).toBe("2025-05-31");
  });

  it("switches to Daily Dispatch: each DC line in the range, and downloads its summary", async () => {
    const saved = captureDownloads();
    const calls = reportsApi();
    renderApp("/reports");
    await screen.findByText("Item 1");
    await userEvent.click(screen.getByRole("button", { name: "Daily Dispatch" }));
    await screen.findByText("456");
    expect(headers()).toEqual([
      "Material",
      "Qty",
      "Packets",
      "PO #",
      "GEMC #",
      "Invoice #",
      "Challan #",
      "Dispatch Delivered",
    ]);
    expect(
      bodyRows().map((r) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ["Item 1", "40 Nos", "2", "4500001", "GEMC-1", "201", "101", "456"],
      ["Item 3", "1", "-", "4500002", "-", "-", "102", "-"],
    ]);
    expect(
      within(bodyRows()[0] as HTMLElement)
        .getByRole("link", { name: "101" })
        .getAttribute("href"),
    ).toBe(`/dc/${id("D1")}`);
    expect(last(calls, "GET /api/reports/daily-dispatch")?.get("from")).toBe("2025-05-31");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(saved).toEqual(["Daily_Dispatch_2025-05-31_to_2025-06-01.xlsx"]));
    const sent = last(calls, "GET /api/reports/daily-dispatch/export");
    expect([sent?.get("from"), sent?.get("to")]).toEqual(["2025-05-31", "2025-06-01"]);
  });

  it("downloads the tab's workbook for the range, without the search text", async () => {
    const saved = captureDownloads();
    const calls = reportsApi();
    renderApp("/reports?q=bolt");
    await screen.findByText("Item 1");
    expect(last(calls, "GET /api/reports/pending")?.get("q")).toBe("bolt");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(saved).toEqual(["Items_Summary_2025-05-31_to_2025-06-01.xlsx"]));
    const sent = last(calls, "GET /api/reports/pending/export");
    expect([sent?.get("from"), sent?.get("to"), sent?.get("q")]).toEqual(["2025-05-31", "2025-06-01", null]);
  });

  it("downloads the selected rows' POs once each through export-selected, then clears the selection", async () => {
    const saved = captureDownloads();
    const calls = reportsApi();
    renderApp("/reports");
    await screen.findByText("Item 1");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
    // A click on the row selects it too, as legacy.
    await userEvent.click(screen.getByText("Item 2"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select row 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Download (3)" }));
    await waitFor(() => expect(saved).toEqual(["PO_Reconciliation_Report.xlsx"]));
    expect(calls.filter((c) => c.route === "POST /api/reports/export-selected").map((c) => c.body)).toEqual([
      { poIds: [id("P1"), id("P2")] },
    ]);
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
  });

  it("keeps Reset in its slot until the range changes, and Reset goes back to the default range", async () => {
    const calls = reportsApi();
    renderApp("/reports");
    await screen.findByText("Item 1");
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset.className).toContain("invisible");
    const from = screen.getByLabelText("From");
    await userEvent.clear(from);
    await userEvent.type(from, "01/05/2025{Enter}");
    await waitFor(() => expect(last(calls, "GET /api/reports/pending")?.get("from")).toBe("2025-05-01"));
    expect(screen.getByRole("button", { name: "Reset" }).className).not.toContain("invisible");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(last(calls, "GET /api/reports/pending")?.get("from")).toBe("2025-05-31"));
  });
});
