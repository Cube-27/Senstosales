// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fail, file, renderApp, stubApi } from "./screens.tsx";
import { DC_ID, invoice, INVOICE_ID, invoiceDetail, PO_ID, SRV_REF } from "./doc-fixtures.ts";

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

const DETAIL = `GET /api/invoice/${INVOICE_ID}`;

function api(detail: () => unknown = () => invoiceDetail(), extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({ [DETAIL]: detail, ...extra });
}

const field = (label: string) => screen.getByText(label, { selector: "div" }).nextElementSibling?.textContent;

describe("/invoice/:id (SPEC-18 PR 3)", () => {
  it("shows the invoice sheet: parties, document fields and the lines with their taxes", async () => {
    api();
    renderApp(`/invoice/${INVOICE_ID}`);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("INV-17");
    expect(screen.getByText("Example Supplier")).toBeTruthy();
    expect(screen.getByText("Example Buyer Unit")).toBeTruthy();
    expect(field("Dated")).toBe("03/05/2025");
    expect(field("Challan No")).toBe("17");
    expect(field("Challan Date")).toBe("02/05/2025");
    expect(field("Buyer's Order No.")).toBe("4100000101");
    expect(field("Order Date")).toBe("05/04/2025");
    expect(field("Despatched Through")).toBe("Example Transport");
    expect(field("GEMC No")).toBe("—");
    expect(screen.getByRole("link", { name: "4100000101" }).getAttribute("href")).toBe(`/po/${PO_ID}`);
    const line = screen.getByRole("cell", { name: "SYN100020Synthetic part 20" }).closest("tr") as HTMLElement;
    expect(
      within(line)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["2", "SYN100020Synthetic part 20", "0000", "NOS", "2", "40", "₹80", "₹7.2", "₹7.2", "₹94.4"]);
    expect(screen.getByText("₹566.4")).toBeTruthy();
  });

  it("names a PO-direct invoice's source PO", async () => {
    api(() => invoiceDetail({ dc: null, invoice: invoice({ kind: "direct", dcId: null }) }));
    renderApp(`/invoice/${INVOICE_ID}`);
    await screen.findByRole("heading", { level: 1 });
    expect(field("Source PO")).toBe("4100000101");
    expect(field("Challan Date")).toBe("—");
  });

  it("links the SRVs and disables delete with the reason while one is linked (INV-35, INV-37)", async () => {
    api(() => invoiceDetail({ srvs: [SRV_REF] }));
    renderApp(`/invoice/${INVOICE_ID}`);
    expect((await screen.findByRole("link", { name: "5000101" })).getAttribute("href")).toBe(`/srv/${SRV_REF.id}`);
    expect(screen.getByText("Invoice linked to SRV cannot be deleted")).toBeTruthy();
    const del = screen.getByRole("button", { name: "Invoice linked to SRV cannot be deleted" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("link", { name: "17" })[0]?.getAttribute("href")).toBe(`/dc/${DC_ID}`);
  });

  it("downloads the invoice workbook", async () => {
    api(undefined, { [`GET /api/invoice/${INVOICE_ID}/excel`]: () => file("Invoice_INV-17.xlsx") });
    renderApp(`/invoice/${INVOICE_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(saved.names).toEqual(["Invoice_INV-17.xlsx"]));
  });

  it("edits header fields in a dialog and sends the version with the stored header (INV-33)", async () => {
    let body: unknown;
    api(undefined, {
      [`PUT /api/invoice/${INVOICE_ID}`]: (call) => {
        body = call.body;
        return invoice();
      },
    });
    renderApp(`/invoice/${INVOICE_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Invoice INV-17" });
    fireEvent.change(within(dialog).getByLabelText("SRV No"), { target: { value: "5000101" } });
    fireEvent.change(within(dialog).getByLabelText("Destination"), { target: { value: " " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The body is the stored header and number with the edits, the version, and nothing the edit cannot change.
    const notSent = new Set(["id", "poId", "financialYear", "createdAt", "kind", "dcId", "cgstPct", "sgstPct"]);
    for (const tax of ["taxable", "cgst", "sgst", "igst", "total"]) notSent.add(tax);
    const stored = Object.entries(invoice()).filter(([key]) => !notSent.has(key));
    expect(body).toEqual({ ...Object.fromEntries(stored), srvNo: "5000101", destination: null });
  });

  it("refuses a blank buyer with the legacy message and shows the API's refusal in place", async () => {
    const calls = api(undefined, {
      [`PUT /api/invoice/${INVOICE_ID}`]: () =>
        fail(409, "invoice-number-taken", "Invoice INV-17 already exists in FY 2024-25."),
    });
    renderApp(`/invoice/${INVOICE_ID}`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Invoice INV-17" });
    fireEvent.change(within(dialog).getByLabelText("Buyer Name*"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Buyer name is required.");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    fireEvent.change(within(dialog).getByLabelText("Buyer Name*"), { target: { value: "Example Buyer Unit" } });
    const dated = within(dialog).getByLabelText("Dated*");
    fireEvent.change(dated, { target: { value: "03/03/2025" } });
    fireEvent.blur(dated);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe("Invoice INV-17 already exists in FY 2024-25."),
    );
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ invoiceDate: "2025-03-03" });
  });
});
