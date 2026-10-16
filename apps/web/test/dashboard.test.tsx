// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderApp, reply, signedIn, stubApi } from "./app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUMMARY = {
  poValue: "1500000",
  invoicedValue: "84000.5",
  avgLeadTimeDays: 12,
  overdueCount: 3,
  uninvoicedDcCount: 1,
  openFlagCount: 2,
  pendingDispatchValue: "250000",
  funnel: { ordQty: "1000", dspQty: "400", invoicedQty: "250", rcdQty: "333.4", pendingQty: "550" },
};

const ACTIVITY = [
  {
    type: "po",
    id: "01J00000000000000000000PA1",
    number: "4500001",
    date: "2025-01-05",
    createdAt: "2025-01-05T10:00:00Z",
  },
  { type: "dc", id: "01J00000000000000000000DC1", number: "12", date: null, createdAt: "2025-01-04T10:00:00Z" },
  {
    type: "invoice",
    id: "01J00000000000000000000NV1",
    number: "7",
    date: "2025-01-03",
    createdAt: "2025-01-03T10:00:00Z",
  },
];

function dashboardApi(summary = (_url: URL): unknown => SUMMARY) {
  return stubApi({
    ...signedIn(true),
    "GET /api/dashboard/summary": (_body: unknown, url: URL) => summary(url),
    "GET /api/dashboard/activity": ACTIVITY,
  });
}

/** Each stat card's label and value, in order. */
const cards = (): Array<[string, string]> =>
  Array.from(screen.getByRole("region", { name: "Page summary" }).children, (card) => {
    const [label, value] = Array.from(card.querySelectorAll("p"), (p) => p.textContent ?? "");
    return [label ?? "", value ?? ""];
  });

describe("dashboard (SPEC-15 PR 4)", () => {
  it("shows the legacy stat cards for the current FY", async () => {
    dashboardApi();
    renderApp("/");
    // The file's first render loads the whole app (about 1.2 s cold), past waitFor's 1 s default (#89 follow-up).
    await waitFor(
      () =>
        expect(cards()).toEqual([
          ["PO Value", "₹ rupees 15.00L"],
          ["Invoiced", "₹ rupees 84,001"],
          ["Lead Time", "12d"],
          ["Overdue", "3"],
        ]),
      { timeout: 5000 },
    );
    expect(screen.getByText("Supply chain overview - This FY")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Overdue/ }).getAttribute("href")).toBe("/delivery-tracker");
  });

  it("shows the action rows with the uninvoiced-DC and open-flag counts (INV-60)", async () => {
    dashboardApi();
    renderApp("/");
    const invoice = await screen.findByRole("link", { name: /DCs await invoice creation/ });
    await waitFor(() =>
      expect(invoice.textContent).toBe("DCs await invoice creation1 challan pending billingCreate Invoice"),
    );
    expect(invoice.getAttribute("href")).toBe("/invoice/create");
    expect(screen.getByRole("link", { name: /SRVs with deviations detected/ }).textContent).toBe(
      "SRVs with deviations detected2 items need reviewReview",
    );
    expect(screen.getByRole("link", { name: /POs have items ready to dispatch/ }).textContent).toBe(
      "POs have items ready to dispatch₹2.50L value pendingCreate DC",
    );
  });

  it("lists recent documents with their dates, linked by id", async () => {
    dashboardApi();
    renderApp("/");
    const po = await screen.findByRole("link", { name: /PO 4500001/ });
    expect(po.textContent).toBe("PO 450000105/01/2025");
    expect(po.getAttribute("href")).toBe("/po/01J00000000000000000000PA1");
    expect(screen.getByRole("link", { name: /DC 12/ }).textContent).toBe("DC 12N/A");
    expect(screen.getByRole("link", { name: /Invoice 7/ }).getAttribute("href")).toBe(
      "/invoice/01J00000000000000000000NV1",
    );
  });

  it("shows the funnel stages with their share of the ordered quantity and the pending dispatch", async () => {
    dashboardApi();
    renderApp("/");
    const funnel = await screen.findByRole("region", { name: "Supply Chain Funnel" });
    await waitFor(() =>
      expect(within(funnel).getByText("Ordered").closest("div.px-4")?.textContent).toBe(
        "OrderedTotal PO quantity1,000",
      ),
    );
    expect(within(funnel).getByText("Dispatched").closest("div.px-4")?.textContent).toBe(
      "DispatchedVia Delivery Challans40040.0%",
    );
    expect(within(funnel).getByText("Accepted").closest("div.px-4")?.textContent).toBe(
      "AcceptedConfirmed via SRV333.433.3%",
    );
    expect(within(funnel).getByText("Pending Dispatch").parentElement?.textContent).toBe(
      "Pending Dispatch550 units(55.0%)",
    );
  });

  it("switching the period asks for that period and keeps the cards on screen meanwhile", async () => {
    const ranges: string[] = [];
    dashboardApi((url) => {
      ranges.push(url.searchParams.get("range") ?? "");
      return url.searchParams.get("range") === "all" ? { ...SUMMARY, overdueCount: 9 } : SUMMARY;
    });
    renderApp("/");
    await waitFor(() => expect(cards()[3]).toEqual(["Overdue", "3"]));
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Supply chain overview - All")).toBeTruthy();
    await waitFor(() => expect(cards()[3]).toEqual(["Overdue", "9"]));
    expect(ranges).toEqual(["fy", "all"]);
  });

  it("recent activity keeps four row slots whether loading, short or empty (C8)", async () => {
    stubApi({ ...signedIn(true), "GET /api/dashboard/summary": SUMMARY, "GET /api/dashboard/activity": [] });
    renderApp("/");
    const section = await screen.findByRole("region", { name: "Recent Activity" });
    await screen.findByText("No recent activity");
    const slots = Array.from(section.querySelectorAll('[class~="h-[61px]"]'));
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.getAttribute("aria-hidden"))).toEqual([null, "true", "true", "true"]);
  });

  it("says when the summary fails to load, and keeps every value at 0", async () => {
    dashboardApi(() => reply(500, { code: "internal", message: "The database is not reachable." }));
    renderApp("/");
    const toast = await screen.findByRole("status");
    expect([toast.textContent, cards()[3]]).toEqual([
      "Failed to load summaryThe database is not reachable.",
      ["Overdue", "0"],
    ]);
  });
});
