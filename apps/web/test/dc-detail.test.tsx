// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fail, file, renderApp, stubApi } from "./screens.tsx";
import { dc, DC_ID, dcDetail, FY_REF, INVOICE_ID, PO_ID, poDetail, SRV_REF } from "./doc-fixtures.ts";

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

const DETAIL = `GET /api/dc/${DC_ID}`;

function api(detail: () => unknown = () => dcDetail(), extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({ [DETAIL]: detail, [`GET /api/po/${PO_ID}`]: () => poDetail(), ...extra });
}

const field = (label: string) => screen.getByText(label, { selector: "div" }).nextElementSibling?.textContent;

describe("/dc/:id (SPEC-18 PR 1)", () => {
  it("shows the header, the lines with their value, the totals and the GC line", async () => {
    api();
    renderApp(`/dc/${DC_ID}`);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("17");
    expect(field("Department")).toBe("21");
    expect(field("GC Number")).toBe("17");
    expect(field("GC Date")).toBe("02/05/2025");
    expect(field("Consignee")).toBe("Example Consignee");
    expect(field("Invoice Status")).toBe("Pending");
    const line = screen.getByRole("cell", { name: "20" }).closest("tr") as HTMLElement;
    expect(
      within(line)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["20", "SYN100020Synthetic part 20", "NOS", "2", "40.00", "₹80.00"]);
    // 4 × 100 + 2 × 40; received is each line's PO item received (2 + 0, EC-38).
    expect(screen.getByText("2 items")).toBeTruthy();
    expect(screen.getByText("Value: ₹480.00")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Received").textContent).toBe("Received 2"));
    expect(screen.getByText("Dispatched", { selector: "span" }).textContent).toBe("Dispatched 6");
    expect(screen.getByText("Guarantee Certificate No. 17 Dt. 02/05/2025")).toBeTruthy();
    expect(screen.getByText("Consignment Value of DC ₹480.00")).toBeTruthy();
    expect(screen.getByText("First note")).toBeTruthy();
    expect(screen.getByText("Second note")).toBeTruthy();
  });

  it("disables Create Invoice and delete once invoiced, with the reason, and links the invoice (INV-28, INV-35)", async () => {
    api(() => dcDetail({ invoice: FY_REF }));
    renderApp(`/dc/${DC_ID}`);
    await screen.findByRole("heading", { level: 1 });
    expect((screen.getByRole("button", { name: "Create Invoice" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("DC linked to invoice cannot be deleted")).toBeTruthy();
    const del = screen.getByRole("button", { name: "DC linked to invoice cannot be deleted" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTitle("Invoice INV-17").getAttribute("href")).toBe(`/invoice/${INVOICE_ID}`);
  });

  it("shows the linked SRVs and disables delete while one is linked (INV-35, INV-37)", async () => {
    api(() => dcDetail({ srvs: [SRV_REF] }));
    renderApp(`/dc/${DC_ID}`);
    const srv = await screen.findByRole("link", { name: "5000101" });
    expect(srv.getAttribute("href")).toBe(`/srv/${SRV_REF.id}`);
    expect(screen.getByRole("link", { name: "Create Invoice" }).getAttribute("href")).toBe(
      `/invoice/create?dc=${DC_ID}`,
    );
    const del = screen.getByRole("button", { name: "DC linked to SRV cannot be deleted" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads the DC and GC workbooks under the API's names", async () => {
    api(undefined, {
      [`GET /api/dc/${DC_ID}/excel`]: () => file("DC_17.xlsx"),
      [`GET /api/dc/${DC_ID}/gc-excel`]: () => file("GC_17.xlsx"),
    });
    renderApp(`/dc/${DC_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "DC" }));
    await waitFor(() => expect(saved.names).toEqual(["DC_17.xlsx"]));
    fireEvent.click(screen.getByRole("button", { name: "GC" }));
    await waitFor(() => expect(saved.names).toEqual(["DC_17.xlsx", "GC_17.xlsx"]));
  });

  it("edits header fields in a dialog and saves them with the version, never the lines (INV-33)", async () => {
    let stored = dcDetail();
    const calls = api(() => stored, {
      [`PUT /api/dc/${DC_ID}`]: (call) => {
        stored = dcDetail({ dc: dc({ consigneeName: "Example Consignee Two", version: 4 }) });
        return { ...dc(), consigneeName: "Example Consignee Two", version: 4, ...(call.body as object) };
      },
    });
    renderApp(`/dc/${DC_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit DC 17" });
    fireEvent.change(within(dialog).getByLabelText("Consignee"), { target: { value: "Example Consignee Two" } });
    fireEvent.change(within(dialog).getByLabelText("Department"), { target: { value: "" } });
    // The invoice the DC sheet cites, filled in by the user (EC-47).
    fireEvent.change(within(dialog).getByLabelText("Invoice No"), { target: { value: " INV-17 " } });
    fireEvent.change(within(dialog).getByLabelText("Lot No."), { target: { value: "12345 - Example Agency" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      ...dc(),
      id: undefined,
      poId: undefined,
      financialYear: undefined,
      createdAt: undefined,
      consigneeName: "Example Consignee Two",
      departmentNo: null,
      invoiceNumber: "INV-17",
      lotNo: "12345 - Example Agency",
    });
    expect(await screen.findByText("Example Consignee Two")).toBeTruthy();
  });

  it("sends a blank GC number for the DC's own (INV-26) and keeps the dialog open with the API's refusal", async () => {
    const calls = api(undefined, {
      [`PUT /api/dc/${DC_ID}`]: () => fail(409, "gc-number-taken", "GC 9 already exists in FY 2025-26."),
    });
    renderApp(`/dc/${DC_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit DC 17" });
    fireEvent.change(within(dialog).getByLabelText("GC Number"), { target: { value: " " } });
    fireEvent.change(within(dialog).getByLabelText("Consignee"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe("GC 9 already exists in FY 2025-26."),
    );
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ gcNumber: null, consigneeName: null });
  });

  it("deletes a DC with no links after confirmation and goes back to the list", async () => {
    const calls = api(undefined, {
      [`DELETE /api/dc/${DC_ID}`]: () => ({ ok: true }),
      "GET /api/dc": () => ({ items: [], total: 0 }),
      "GET /api/dc/stats": () => ({ count: 0, dspQty: "0", value: "0", rcdQty: "0" }),
    });
    const { router } = renderApp(`/dc/${DC_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Delete DC 17" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dc"));
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([`/api/dc/${DC_ID}`]);
  });
});
