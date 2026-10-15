// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fail, renderApp, stubApi } from "./screens.tsx";

vi.mock("../src/platform/index.ts", () => ({
  getPlatform: async () => ({ pickFiles: async () => null, pickFolder: async () => null }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SRV_A = "01J00000000000000000000031";
const SRV_B = "01J00000000000000000000032";
const PO_ID = "01J00000000000000000000010";

/** An SRV list row on the wire: quantities and money are decimal strings. */
const srv = (over: Record<string, unknown> = {}) => ({
  id: SRV_A,
  srvNumber: "5000000101",
  srvDate: "2025-03-02",
  poNumber: "4100000101",
  poId: PO_ID,
  ordQty: "10",
  rcdQty: "6",
  acceptedQty: "5",
  rejQty: "1",
  value: "600",
  ...over,
});

const byPo = (over: Record<string, unknown> = {}) => ({
  poNumber: "4100000101",
  poId: PO_ID,
  latestSrvDate: "2025-03-02",
  srvCount: 2,
  ordQty: "10",
  rcdQty: "8",
  acceptedQty: "7",
  rejQty: "1",
  value: "800",
  ...over,
});

const STATS = { srvCount: 2, poCount: 1, rcdQty: "8", acceptedQty: "7", rejQty: "1" };

function api(extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /api/srv": (call) =>
      call.query["poNumber"]
        ? { items: [srv(), srv({ id: SRV_B, srvNumber: "5000000102", rcdQty: "2" })], total: 2 }
        : { items: [srv(), srv({ id: SRV_B, srvNumber: "5000000102", poId: null, poNumber: "4100000999" })], total: 2 },
    "GET /api/srv/by-po": () => ({ items: [byPo()], total: 1 }),
    "GET /api/srv/stats": () => STATS,
    ...extra,
  });
}

const bodyRows = () =>
  screen.getAllByRole("row").filter((tr) => tr.closest("tbody") && !tr.hasAttribute("aria-hidden"));

describe("/srv (SPEC-16 PR 4)", () => {
  it("lists SRVs with their totals and labels an SRV whose PO is not in the system (INV-40)", async () => {
    api();
    renderApp("/srv");
    await screen.findByText("5000000102");
    const [first, second] = bodyRows() as [HTMLElement, HTMLElement];
    expect(within(first).getByRole("link", { name: "4100000101" }).getAttribute("href")).toBe(`/po/${PO_ID}`);
    expect(within(second).getByText("PO not found")).toBeTruthy();
    expect(within(second).queryByRole("link", { name: "4100000999" })).toBeNull();
    expect(within(first).getByText("₹600")).toBeTruthy();
  });

  it("switches to the by-PO view, whose SRV count opens that PO's SRVs", async () => {
    const calls = api();
    const { router } = renderApp("/srv");
    await screen.findByText("5000000102");
    fireEvent.click(screen.getByRole("button", { name: "PO View" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: "po" }));
    expect(await screen.findByText("Total POs")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "SRVs for PO 4100000101" }));
    await screen.findByRole("link", { name: "5000000102" });
    expect(calls.find((c) => c.path === "/api/srv" && c.query["poNumber"])?.query["poNumber"]).toBe("4100000101");
  });

  it("deletes an SRV after confirmation, never blocked (INV-35)", async () => {
    const calls = api({ [`DELETE /api/srv/${SRV_A}`]: () => ({ ok: true }) });
    renderApp("/srv");
    fireEvent.click(await screen.findByRole("button", { name: "Delete SRV 5000000101" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete SRV" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === `/api/srv/${SRV_A}`)).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete SRV" })).toBeNull());
  });

  it("keeps the dialog open with the server's message when a delete fails", async () => {
    api({ [`DELETE /api/srv/${SRV_A}`]: () => fail(404, "NOT_FOUND", "SRV not found") });
    renderApp("/srv");
    fireEvent.click(await screen.findByRole("button", { name: "Delete SRV 5000000101" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete SRV" }));
    expect((await screen.findAllByText("SRV not found")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Delete SRV" })).toBeTruthy();
  });
});
