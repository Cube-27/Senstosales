// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fail, renderApp, stubApi } from "./screens.tsx";

const picked = vi.hoisted(() => ({ files: null as File[] | null }));
vi.mock("../src/platform/index.ts", () => ({
  getPlatform: async () => ({ pickFiles: async () => picked.files, pickFolder: async () => picked.files }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID_A = "01J00000000000000000000001";
const ID_B = "01J00000000000000000000002";

/** A PO list row on the wire: quantities and money are decimal strings. */
const row = (over: Record<string, unknown> = {}) => ({
  id: ID_A,
  poNumber: "4100000101",
  poDate: "2025-01-05",
  isGemc: false,
  poValue: "1234.56789",
  status: "Pending",
  ordQty: "10",
  dspQty: "4",
  rcdQty: "7",
  rejQty: "1",
  balanceQty: "3",
  itemCount: 2,
  uninvoicedQty: "10",
  dcCount: 0,
  invoiceCount: 0,
  srvCount: 1,
  openFlagCount: 0,
  ...over,
});

const STATS = { count: 2, poValue: "250000", dspQty: "12", rejQty: "1" };

function api(rows: unknown[], extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /api/po": () => ({ items: rows, total: rows.length }),
    "GET /api/po/stats": () => STATS,
    ...extra,
  });
}

const cells = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole("cell")
    .map((td) => td.textContent);
const bodyRows = () =>
  screen.getAllByRole("row").filter((tr) => tr.closest("tbody") && !tr.hasAttribute("aria-hidden"));

describe("/po (SPEC-16 PR 1)", () => {
  it("leads with the quantity columns and shows each row's values (INV-65, INV-73)", async () => {
    api([row({ isGemc: true, openFlagCount: 2, status: "Delivered" })]);
    renderApp("/po");
    await screen.findByRole("link", { name: "4100000101" });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Reference",
      "Date",
      "Tags",
      "Items",
      "Ordered",
      "Pending",
      "Dispatched",
      "Received",
      "Accepted",
      "Rejected",
      "Value",
      "Status",
      "Flags",
      "Actions",
    ]);
    // Dispatched 4 with the ring at max(4, 7) / 10; Accepted shows received (INV-09); GEMC money to 5 dp.
    expect(cells(bodyRows()[0]!).slice(0, 13)).toEqual([
      "4100000101",
      "05/01/2025",
      "GEMC",
      "2",
      "10",
      "3",
      "470%",
      "7",
      "7",
      "1",
      "₹1,234.57",
      "Delivered",
      "2",
    ]);
    expect(screen.getByTitle("70% supplied")).toBeTruthy();
    expect(bodyRows()[0]!.dataset["highlighted"]).toBe("true");
  });

  it("shows the KPI cards over the filtered POs", async () => {
    api([row()]);
    renderApp("/po");
    const summary = await screen.findByRole("region", { name: "Page summary" });
    await waitFor(() =>
      expect(summary.textContent).toBe("Active Orders2Total Value₹ rupees 2.50LTotal Shipped12Total Rejected1"),
    );
  });

  it("filters by status, and a second click on the status shows all again", async () => {
    const calls = api([row()]);
    const { router } = renderApp("/po");
    await screen.findByRole("link", { name: "4100000101" });
    fireEvent.click(screen.getByRole("button", { name: "Delivered" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "Delivered" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === "/api/po").at(-1)?.query).toMatchObject({ status: "Delivered" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delivered" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("status"));
  });

  it("disables Delete with the plain reason while DCs or invoices exist (INV-35)", async () => {
    api([row({ dcCount: 1, invoiceCount: 2 })]);
    renderApp("/po");
    fireEvent.click(await screen.findByRole("button", { name: "More actions for PO 4100000101" }));
    const del = await screen.findByRole("button", { name: "Delete" });
    expect([del.hasAttribute("disabled"), del.title]).toEqual([
      true,
      "Cannot delete - linked to 2 invoices and 1 delivery challan",
    ]);
  });

  it("deletes a PO after confirmation and shows the server's reason when it refuses", async () => {
    let refuse = false;
    const calls = api([row({ id: ID_B, poNumber: "4100000102" })], {
      "DELETE /api/po/01J00000000000000000000002": () =>
        refuse ? fail(409, "delete-blocked", "This PO has delivery challans. Delete them first.") : { ok: true },
    });
    renderApp("/po");
    const remove = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "More actions for PO 4100000102" }));
      fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
      fireEvent.click(await screen.findByRole("button", { name: "Delete PO" }));
    };
    await remove();
    expect(await screen.findByText("PO 4100000102 has been deleted successfully.")).toBeTruthy();
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([`/api/po/${ID_B}`]);
    refuse = true;
    await remove();
    expect(await screen.findByText("This PO has delivery challans. Delete them first.")).toBeTruthy();
  });

  it("uploads picked PO pages and lists each file's outcome", async () => {
    picked.files = [new File(["<p>a</p>"], "a.html"), new File(["<p>b</p>"], "b.html")];
    const calls = api([row()], {
      "POST /api/po/upload": (call) => {
        const name = (call.body as { files: { name: string }[] }).files[0]!.name;
        return {
          results: [
            name === "a.html"
              ? { name, status: "accepted", reason: null }
              : { name, status: "skipped", reason: "A newer copy of this PO is already stored." },
          ],
        };
      },
    });
    renderApp("/po");
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Upload PO HTML" }));
    expect(await screen.findByText("Upload Complete")).toBeTruthy();
    expect(screen.getByText("A newer copy of this PO is already stored.")).toBeTruthy();
    expect(calls.filter((c) => c.path === "/api/po/upload")).toHaveLength(2);
  });
});
