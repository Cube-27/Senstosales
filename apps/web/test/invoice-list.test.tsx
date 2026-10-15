// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fail, file, renderApp, stubApi } from "./screens.tsx";
import { DC_ID, INVOICE_ID, invoiceRow, PO_ID } from "./doc-fixtures.ts";

const saved = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("../src/platform/index.ts", () => ({
  getPlatform: async () => ({
    saveFile: async ({ name }: { name: string }) => {
      saved.names.push(name);
      return "saved";
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  saved.names = [];
});

const STATS = { count: 2, total: "1180", taxable: "1000", tax: "180" };
const DIRECT_ID = "01J00000000000000000000049";

function api(rows: unknown[], extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /api/invoice": () => ({ items: rows, total: rows.length }),
    "GET /api/invoice/stats": () => STATS,
    ...extra,
  });
}

const rowOf = (number: string) => screen.getByRole("link", { name: number }).closest("tr") as HTMLElement;
const cells = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole("cell")
    .map((td) => td.textContent);

describe("/invoice (SPEC-18 PR 3)", () => {
  it("shows the legacy columns, a PO-direct invoice as Direct, and the KPI cards", async () => {
    api([invoiceRow(), invoiceRow({ id: DIRECT_ID, number: "INV-18", kind: "direct", dc: null, itemCount: 1 })]);
    renderApp("/invoice");
    await screen.findByRole("link", { name: "INV-18" });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Invoice #",
      "Date",
      "Linked DCs",
      "Linked POs",
      "Items",
      "Dispatched",
      "Value",
      "Actions",
    ]);
    expect(cells(rowOf("INV-17")).slice(0, 7)).toEqual([
      "INV-17",
      "03/05/2025",
      "17",
      "4100000101",
      "2",
      "6",
      "₹566.4",
    ]);
    expect(cells(rowOf("INV-18"))[2]).toBe("Direct");
    expect(within(rowOf("INV-17")).getByRole("link", { name: "17" }).getAttribute("href")).toBe(`/dc/${DC_ID}`);
    expect(screen.getAllByRole("link", { name: "4100000101" })[0]?.getAttribute("href")).toBe(`/po/${PO_ID}`);
    expect(screen.getByText("Taxable Value").parentElement?.textContent).toContain("1,000");
  });

  it("downloads an invoice's Excel and the register with the list's filters", async () => {
    const calls = api([invoiceRow()], {
      [`GET /api/invoice/${INVOICE_ID}/excel`]: () => file("Invoice_INV-17.xlsx"),
      "GET /api/invoice/export": () => file("Invoice_List_Export_All.csv"),
    });
    renderApp("/invoice?valueMin=100");
    await screen.findByRole("link", { name: "INV-17" });
    fireEvent.click(screen.getByRole("button", { name: "Download Invoice INV-17" }));
    await waitFor(() => expect(saved.names).toEqual(["Invoice_INV-17.xlsx"]));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(saved.names[1]).toBe("Invoice_List_Export_All.csv"));
    expect(calls.find((c) => c.path === "/api/invoice/export")?.query).toEqual({ dir: "asc", valueMin: "100" });
  });

  it("shows the API's reason when a delete is refused (INV-35)", async () => {
    api([invoiceRow()], {
      [`DELETE /api/invoice/${INVOICE_ID}`]: () =>
        fail(409, "delete-blocked", "An SRV is linked to this invoice, so it cannot be deleted."),
    });
    renderApp("/invoice");
    await screen.findByRole("link", { name: "INV-17" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Invoice #INV-17" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete Invoice" }));
    expect(await screen.findByText("An SRV is linked to this invoice, so it cannot be deleted.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "INV-17" })).toBeTruthy();
  });
});
