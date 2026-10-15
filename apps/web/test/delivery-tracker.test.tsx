// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { type Call, fileReply, renderApp, signedIn, stubApi } from "./app.tsx";
import { captureDownloads } from "./downloads.ts";

// Today is 2025-06-01 in IST; only `Date` is faked, so timers and user events run as usual.
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

const lot = (tag: string, over: Record<string, unknown> = {}) => ({
  lotId: id(`T${tag}`),
  lotNo: 1,
  delyDate: "2025-05-30",
  entryAllowDate: "2025-05-25",
  entryAllowNote: null,
  poId: id("P1"),
  poNumber: "4500001",
  poItemId: id("A1"),
  poItemNo: 10,
  materialCode: "M-10",
  description: "Hex bolt",
  drawingNo: null,
  rate: "100",
  ordQty: "10",
  dspQty: "0",
  rcdQty: "0",
  balanceQty: "10",
  pendingValue: "1000",
  daysToDue: -2,
  overdue: true,
  ...over,
});

const ROWS = [
  lot("1"),
  lot("2", { lotNo: 2, delyDate: "2025-06-05", entryAllowDate: null, daysToDue: 4, overdue: false }),
  lot("3", { lotNo: 3, delyDate: "2025-06-01", daysToDue: 0, overdue: false }),
];
const STATS = { overdueCount: 1, dueSoonCount: 2, dueThisMonthCount: 3, pendingValue: "150000" };

function trackerApi() {
  return stubApi({
    ...signedIn(true),
    "GET /api/delivery-tracker": { items: ROWS, total: 3 },
    "GET /api/delivery-tracker/stats": STATS,
    "GET /api/delivery-tracker/export": fileReply("Delivery_Tracker_20250601_1130.xlsx"),
  });
}

const last = (calls: Call[], route: string) => calls.filter((c) => c.route === route).at(-1)?.url.searchParams;
const list = (calls: Call[]) => last(calls, "GET /api/delivery-tracker");
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1] as HTMLElement).getAllByRole("row");

const cards = (): Array<[string, string]> =>
  Array.from(screen.getByRole("region", { name: "Page summary" }).children, (card) => {
    const [label, value] = Array.from(card.querySelectorAll("p"), (p) => p.textContent ?? "");
    return [label ?? "", value ?? ""];
  });

describe("delivery tracker (SPEC-17 PR 3)", () => {
  it("shows the stat cards and the lots with the legacy columns, overdue lots highlighted", async () => {
    trackerApi();
    renderApp("/delivery-tracker");
    expect(await screen.findByRole("heading", { level: 1, name: "Delivery Tracker" })).toBeTruthy();
    await waitFor(() =>
      expect(cards()).toEqual([
        ["Overdue", "1"],
        ["Due This Week", "2"],
        ["Due This Month", "3"],
        ["Pending Value", "₹ rupees 1.50 L"],
      ]),
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "PO / Material",
      "Lot",
      "Due Date",
      "Entry Date",
      "Ord",
      "Dsp",
      "Rcd",
      "Bal",
      "Unit Price",
      "Pending Value",
      "Days Overdue",
    ]);
    await screen.findByText("2d overdue");
    expect(
      bodyRows().map((r) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      ),
    ).toEqual([
      [
        "4500001M-10 · Hex bolt",
        "L1",
        "30/05/2025",
        "25/05/2025",
        "10",
        "0",
        "0",
        "10",
        "₹100.00",
        "₹1,000.00",
        "2d overdue",
      ],
      ["4500001M-10 · Hex bolt", "L2", "05/06/2025", "—", "10", "0", "0", "10", "₹100.00", "₹1,000.00", "Due in 4d"],
      [
        "4500001M-10 · Hex bolt",
        "L3",
        "01/06/2025",
        "25/05/2025",
        "10",
        "0",
        "0",
        "10",
        "₹100.00",
        "₹1,000.00",
        "Today",
      ],
    ]);
    expect(bodyRows().map((r) => r.hasAttribute("data-highlighted"))).toEqual([true, false, false]);
    const first = bodyRows()[0] as HTMLElement;
    expect(within(first).getByRole("link", { name: "4500001" }).getAttribute("href")).toBe(`/po/${id("P1")}`);
    expect(within(first).getByRole("link", { name: "Create DC for PO 4500001" }).getAttribute("href")).toBe(
      `/dc/create?po=${id("P1")}`,
    );
  });

  it("a stat card toggles its status; a date chip replaces it with its due range", async () => {
    const calls = trackerApi();
    const { router } = renderApp("/delivery-tracker");
    await screen.findByText("2d overdue");
    await userEvent.click(screen.getByRole("button", { name: /Overdue/ }));
    await waitFor(() => expect(list(calls)?.get("status")).toBe("overdue"));
    expect(screen.getByRole("button", { name: /Overdue/ }).className).toContain("bg-error-subtle");

    await userEvent.click(screen.getByRole("button", { name: "This Week" }));
    await waitFor(() => expect(list(calls)?.get("dueFrom")).toBe("2025-06-01"));
    expect([list(calls)?.get("dueTo"), list(calls)?.get("status")]).toEqual(["2025-06-08", null]);
    expect(screen.getByRole("button", { name: "This Week" }).getAttribute("aria-pressed")).toBe("true");
    expect(last(calls, "GET /api/delivery-tracker/stats")?.get("dueFrom")).toBe("2025-06-01");

    await userEvent.click(screen.getByRole("button", { name: "This Week" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("dueFrom"));
  });

  it("combines one date chip with one value chip, and Clear all turns every filter off", async () => {
    const calls = trackerApi();
    const { router } = renderApp("/delivery-tracker");
    await screen.findByText("2d overdue");
    const clearAll = screen.getByRole("button", { name: "Clear all" });
    expect(clearAll.className).toContain("invisible");
    await userEvent.click(screen.getByRole("button", { name: "Due Tomorrow" }));
    await userEvent.click(screen.getByRole("button", { name: "Critical ₹10L+" }));
    await waitFor(() => expect(list(calls)?.get("valueMin")).toBe("1000000"));
    expect([list(calls)?.get("dueFrom"), list(calls)?.get("dueTo")]).toEqual(["2025-06-02", "2025-06-02"]);
    await userEvent.click(screen.getByRole("button", { name: "High Value ₹1L+" }));
    await waitFor(() => expect(list(calls)?.get("valueMin")).toBe("100000"));
    expect(screen.getByRole("button", { name: "Critical ₹10L+" }).getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 1, pageSize: 10, dir: "asc" }));
  });

  it("filters by entry date and lot value from More Filters", async () => {
    const calls = trackerApi();
    renderApp("/delivery-tracker");
    await screen.findByText("2d overdue");
    await userEvent.click(screen.getByRole("button", { name: "More Filters" }));
    expect(screen.getByRole("button", { name: "Hide Filters" })).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Lot value from"), "500");
    await userEvent.tab();
    await waitFor(() => expect(list(calls)?.get("valueMin")).toBe("500"));
    await userEvent.type(screen.getByLabelText("Entry date from"), "01/05/2025{Enter}");
    await waitFor(() => expect(list(calls)?.get("entryFrom")).toBe("2025-05-01"));
  });

  it("downloads the tracker with the screen's filters and sort under the server's file name", async () => {
    const saved = captureDownloads();
    const calls = trackerApi();
    renderApp("/delivery-tracker?status=overdue&sort=pendingValue&dir=desc");
    await screen.findByText("2d overdue");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(saved).toEqual(["Delivery_Tracker_20250601_1130.xlsx"]));
    const sent = last(calls, "GET /api/delivery-tracker/export");
    expect([sent?.get("status"), sent?.get("sort"), sent?.get("dir"), sent?.get("page")]).toEqual([
      "overdue",
      "pendingValue",
      "desc",
      null,
    ]);
  });
});
