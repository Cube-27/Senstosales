// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { type Call, renderApp, signedIn, stubApi } from "./app.tsx";

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = (tag: string): string => `01J${"0".repeat(23 - tag.length)}${tag}`;

const ENTRIES = [
  {
    id: id("A1"),
    at: "2025-05-03T04:00:00.000Z",
    actor: "admin",
    action: "dc.create",
    entityType: "dc",
    entityId: id("D1"),
    before: null,
    after: { number: "12" },
    jobId: null,
  },
  {
    id: id("A2"),
    at: "2025-05-01T18:00:00.000Z",
    actor: "admin",
    action: "flag.acknowledge",
    entityType: "reconciliation_issue",
    entityId: id("F1"),
    before: { status: "open" },
    after: { status: "acknowledged" },
    jobId: null,
  },
];

function ledgerApi() {
  return stubApi({ ...signedIn(true), "GET /api/audit": { items: ENTRIES, total: 2 } });
}

const lists = (calls: Call[]) => calls.filter((c) => c.route === "GET /api/audit");
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1] as HTMLElement).getAllByRole("row");

describe("system ledger (SPEC-17 PR 2)", () => {
  it("lists the audit rows newest first with the legacy columns", async () => {
    const calls = ledgerApi();
    renderApp("/system/ledger");
    expect(await screen.findByRole("heading", { level: 1, name: "System Audit Ledger" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Timestamp",
      "Module",
      "Event / Summary",
      "Entity",
      "",
    ]);
    await screen.findByText("Dc Create");
    expect(
      bodyRows().map((r) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ["03/05/2025, 09:30:00 IST", "Dispatch (DC)", "Dc Create", id("D1"), ""],
      ["01/05/2025, 23:30:00 IST", "Deviations", "Flag Acknowledge", id("F1"), ""],
    ]);
    expect(lists(calls)[0]?.url.searchParams.get("sort")).toBeNull();
  });

  it("has no control that deletes or resets the ledger (INV-83)", async () => {
    ledgerApi();
    renderApp("/system/ledger");
    await screen.findByText("Dc Create");
    expect(screen.queryByRole("button", { name: /reset|delete|clear|prune/i })).toBeNull();
  });

  it("filters by module and by search text", async () => {
    const calls = ledgerApi();
    renderApp("/system/ledger");
    await screen.findByText("Dc Create");
    await userEvent.click(screen.getByRole("combobox", { name: "Module" }));
    await userEvent.click(await screen.findByRole("option", { name: "Invoicing" }));
    await waitFor(() => expect(lists(calls).at(-1)?.url.searchParams.get("entityType")).toBe("invoice"));
    await userEvent.type(screen.getByRole("textbox", { name: "Search audit trail..." }), "dc");
    await waitFor(() => expect(lists(calls).at(-1)?.url.searchParams.get("q")).toBe("dc"));
    expect(lists(calls).at(-1)?.url.searchParams.get("entityType")).toBe("invoice");
  });

  it("sorts by timestamp from its header", async () => {
    const calls = ledgerApi();
    renderApp("/system/ledger");
    await screen.findByText("Dc Create");
    await userEvent.click(screen.getByRole("button", { name: "Timestamp" }));
    await waitFor(() => expect(lists(calls).at(-1)?.url.searchParams.get("sort")).toBe("at"));
  });

  it("opens a row's details with the changed values", async () => {
    ledgerApi();
    renderApp("/system/ledger");
    await screen.findByText("Flag Acknowledge");
    await userEvent.click(screen.getByText("Flag Acknowledge"));
    const dialog = await screen.findByRole("dialog", { name: "Log Details" });
    expect(within(dialog).getByText("flag.acknowledge")).toBeTruthy();
    expect(within(dialog).getByText("01/05/2025, 23:30:00 IST")).toBeTruthy();
    expect(within(dialog).getByText("admin")).toBeTruthy();
    expect(JSON.parse(within(dialog).getByTestId("payload").textContent ?? "")).toEqual({
      entityType: "reconciliation_issue",
      entityId: id("F1"),
      before: { status: "open" },
      after: { status: "acknowledged" },
      jobId: null,
    });
  });

  it("opens the details from the row's view button too", async () => {
    ledgerApi();
    renderApp("/system/ledger");
    await screen.findByText("Dc Create");
    await userEvent.click(within(bodyRows()[0] as HTMLElement).getByRole("button", { name: "View log details" }));
    expect(await screen.findByRole("dialog", { name: "Log Details" })).toBeTruthy();
  });
});
