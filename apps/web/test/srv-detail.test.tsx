// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderApp, stubApi } from "./screens.tsx";
import { detail, flag, ITEM_A, item, PO_ID } from "./po-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SRV_ID = "01J00000000000000000000031";
const SRV_ITEM = "01J00000000000000000000035";
const DC_ID = "01J00000000000000000000041";

const srvItem = (over: Record<string, unknown> = {}) => ({
  id: SRV_ITEM,
  srvId: SRV_ID,
  poItemId: ITEM_A,
  materialCode: "SYN100010",
  poItemNo: 10,
  lotNo: 1,
  srvItemNo: 1,
  ordQty: "10",
  rcdQty: "6",
  acceptedQty: "5",
  rejQty: "1",
  challanNo: "DC/7",
  challanDate: "2025-02-20",
  invoiceNo: "INV/9",
  invoiceDate: "2025-02-21",
  resolvedDcId: DC_ID,
  resolvedInvoiceId: null,
  ...over,
});

const header = (over: Record<string, unknown> = {}) => ({
  id: SRV_ID,
  poNumber: "4100000101",
  poId: PO_ID,
  srvNumber: "5000000101",
  srvDate: "2025-03-02",
  financialYear: "2024-25",
  rawHeader: { "PMIR NO": "PM-3", DIV: "D9" },
  ...over,
});

const srvDetail = (over: Record<string, unknown> = {}) => ({
  srv: header(),
  items: [srvItem(), srvItem({ id: "01J00000000000000000000036", srvItemNo: 2, lotNo: 0, poItemId: null })],
  flags: [],
  ...over,
});

describe("/srv/:id (SPEC-16 PR 4)", () => {
  it("shows the receipt details with the raw numbers, linked when resolved (INV-38)", async () => {
    stubApi({
      [`GET /api/srv/${SRV_ID}`]: () => srvDetail(),
      [`GET /api/po/${PO_ID}`]: () => detail({ items: [item()] }),
    });
    renderApp(`/srv/${SRV_ID}`);
    const details = within(await screen.findByRole("region", { name: "Receipt Details" }));
    expect(details.getByRole("link", { name: "DC/7" }).getAttribute("href")).toBe(`/dc/${DC_ID}`);
    expect(details.getByText("INV/9").closest("a")).toBeNull();
    expect([details.getByText("PM-3"), details.getByText("D9")]).toHaveLength(2);
    const row = (await screen.findByText("#10.1")).closest("tr") as HTMLElement;
    expect(await within(row).findByText("Synthetic valve body")).toBeTruthy();
    expect(within(row).getByText("100")).toBeTruthy();
    // An item not matched to a PO item shows its own number and no material.
    expect(screen.getByText("#10")).toBeTruthy();
  });

  it("labels an SRV whose PO is not in the system and fetches no PO (INV-40)", async () => {
    const calls = stubApi({
      [`GET /api/srv/${SRV_ID}`]: () =>
        srvDetail({ srv: header({ poId: null }), items: [srvItem({ poItemId: null })] }),
    });
    renderApp(`/srv/${SRV_ID}`);
    expect(await screen.findAllByText("PO not found")).toHaveLength(2);
    expect(calls.some((c) => c.path.startsWith("/api/po/"))).toBe(false);
  });

  it("marks flagged items", async () => {
    stubApi({
      [`GET /api/srv/${SRV_ID}`]: () =>
        srvDetail({
          items: [srvItem()],
          flags: [flag({ type: "QTY_MISMATCH", scopeType: "srv_item", scopeId: SRV_ITEM })],
        }),
      [`GET /api/po/${PO_ID}`]: () => detail({ items: [item()] }),
    });
    renderApp(`/srv/${SRV_ID}`);
    const row = (await screen.findByText("#10.1")).closest("tr") as HTMLElement;
    expect(row.hasAttribute("data-highlighted")).toBe(true);
    expect(within(row).getByTitle("QTY MISMATCH").textContent).toBe("1");
  });
});
