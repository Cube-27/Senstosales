// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { file, renderApp, stubApi } from "./screens.tsx";
import { DC_ID, dcRow, FY_REF } from "./doc-fixtures.ts";

const saved = vi.hoisted(() => ({ files: [] as { name: string; text: string }[] }));
vi.mock("../src/platform/index.ts", () => ({
  getPlatform: async () => ({
    saveFile: async ({ name, data }: { name: string; data: Blob }) => {
      saved.files.push({ name, text: await data.text() });
      return "saved";
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  saved.files = [];
});

const STATS = { count: 1, dspQty: "6", value: "250000", rcdQty: "3" };

function api(rows: unknown[], extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /api/dc": () => ({ items: rows, total: rows.length }),
    "GET /api/dc/stats": () => STATS,
    ...extra,
  });
}

const cells = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole("cell")
    .map((td) => td.textContent);
const rowOf = (number: string) => screen.getByRole("link", { name: number }).closest("tr") as HTMLElement;

describe("/dc (SPEC-18 PR 1)", () => {
  it("shows the legacy columns with a flag badge column, and the KPI cards", async () => {
    api([dcRow({ openFlagCount: 2 })]);
    renderApp("/dc");
    await screen.findByRole("link", { name: "17" });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Challan #",
      "Date",
      "Linked PO",
      "Ordered",
      "Dispatched",
      "Received",
      "Value",
      "Flags",
      "Actions",
    ]);
    expect(cells(rowOf("17")).slice(0, 8)).toEqual(["17", "02/05/2025", "4100000101", "15", "7", "3", "₹500.00", "2"]);
    expect(screen.getByRole("link", { name: "4100000101" }).getAttribute("href")).toBe(
      "/po/01J00000000000000000000010",
    );
    expect(screen.getByText("Active Shipments").parentElement?.textContent).toContain("1");
    expect(screen.getByText("Total Value").parentElement?.textContent).toContain("2.50L");
  });

  it("offers Generate Invoice until the DC is invoiced, then disables delete with the reason (INV-28, INV-35)", async () => {
    api([dcRow(), dcRow({ id: "01J00000000000000000000039", number: "18", invoice: FY_REF })]);
    renderApp("/dc");
    await screen.findByRole("link", { name: "18" });
    const open = within(rowOf("17"));
    expect(open.getByRole("link", { name: "Generate Invoice for DC 17" }).getAttribute("href")).toBe(
      `/invoice/create?dc=${DC_ID}`,
    );
    expect((open.getByRole("button", { name: "Delete DC #17" }) as HTMLButtonElement).disabled).toBe(false);
    const invoiced = rowOf("18");
    // The invoiced row keeps the button's slot, hidden (C8).
    expect(invoiced.querySelector("a[href*='/invoice/create']")?.className).toContain("invisible");
    const del = within(invoiced).getByRole("button", { name: "DC linked to invoice cannot be deleted" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads a DC's Excel and the list CSV with the list's filters", async () => {
    const calls = api([dcRow()], {
      [`GET /api/dc/${DC_ID}/excel`]: () => file("DC_17.xlsx", "dc workbook"),
      "GET /api/dc/export": () => file("DC_List_Export_All.csv", "csv"),
    });
    renderApp("/dc?q=4100&from=2025-04-01");
    await screen.findByRole("link", { name: "17" });
    fireEvent.click(screen.getByRole("button", { name: "Download DC 17" }));
    await waitFor(() => expect(saved.files).toEqual([{ name: "DC_17.xlsx", text: "dc workbook" }]));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(saved.files[1]).toEqual({ name: "DC_List_Export_All.csv", text: "csv" }));
    expect(calls.find((c) => c.path === "/api/dc/export")?.query).toEqual({
      dir: "asc",
      q: "4100",
      from: "2025-04-01",
    });
    expect(await screen.findByText("DC list downloaded")).toBeTruthy();
  });

  it("deletes a DC after confirmation and reloads the list", async () => {
    let rows = [dcRow()];
    const calls = api([], {
      "GET /api/dc": () => ({ items: rows, total: rows.length }),
      [`DELETE /api/dc/${DC_ID}`]: () => {
        rows = [];
        return { ok: true };
      },
    });
    renderApp("/dc");
    await screen.findByRole("link", { name: "17" });
    fireEvent.click(screen.getByRole("button", { name: "Delete DC #17" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete DC" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "17" })).toBeNull());
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([`/api/dc/${DC_ID}`]);
    expect(await screen.findByText("No delivery challans found.")).toBeTruthy();
  });
});
