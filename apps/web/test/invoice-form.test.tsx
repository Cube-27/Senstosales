// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type Call, fail, renderApp, stubApi } from "./screens.tsx";
import {
  DC_ID,
  DC_ITEM_A,
  DC_ITEM_B,
  DC_REF,
  invoice,
  INVOICE_HEADER,
  INVOICE_ID,
  invoiceDetail,
  ITEM_A,
  ITEM_B,
  itemInfo,
  PO_ID,
  PO_REF,
} from "./doc-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HEADER = INVOICE_HEADER;
const BLANK_BUYER = { buyerName: null, buyerGstin: null, buyerAddress: null, buyerState: null, buyerStateCode: null };

const previewLine = (poItemId: string, dcItemId: string | null, no: number, rate: string, qty: string | null) => ({
  ...itemInfo(no, rate),
  poItemId,
  dcItemId,
  qty,
  uninvoicedQty: no === 10 ? "6" : "5",
});

const FROM_DC = {
  po: PO_REF,
  dc: DC_REF,
  header: HEADER,
  cgstPct: "9",
  sgstPct: "9",
  lines: [previewLine(ITEM_A, DC_ITEM_A, 10, "100", "4"), previewLine(ITEM_B, DC_ITEM_B, 20, "40", "2")],
};

const FROM_PO = {
  ...FROM_DC,
  dc: null,
  header: { ...HEADER, ...BLANK_BUYER },
  lines: [previewLine(ITEM_A, null, 10, "100", null), previewLine(ITEM_B, null, 20, "40", null)],
};

const BUYERS = [
  {
    id: "01J00000000000000000000060",
    unitName: "Example Buyer Unit",
    state: "Example State",
    stateCode: "99",
    gstin: "TESTGSTIN0002",
  },
];

type Handlers = Parameters<typeof stubApi>[0];

function api(extra: Handlers = {}, taken: (call: Call) => boolean = () => false) {
  return stubApi({
    [`GET /api/invoice/preview/dc/${DC_ID}`]: () => FROM_DC,
    [`GET /api/invoice/preview/po/${PO_ID}`]: () => FROM_PO,
    "GET /api/buyers": () => BUYERS,
    "GET /api/invoice/number-check": (call) => ({ taken: taken(call), financialYear: "2025-26" }),
    [`GET /api/invoice/${INVOICE_ID}`]: () => invoiceDetail(),
    ...extra,
  });
}

async function fill(number: string) {
  fireEvent.change(await screen.findByLabelText("Invoice No.*"), { target: { value: number } });
  const dated = screen.getByLabelText("Dated*");
  fireEvent.change(dated, { target: { value: "03/05/2025" } });
  fireEvent.blur(dated);
}

const saveButton = () => screen.getByRole("button", { name: "Save Invoice" }) as HTMLButtonElement;
const cells = (name: string) =>
  within(screen.getByRole("cell", { name }).closest("tr") as HTMLElement)
    .getAllByRole("cell")
    .map((td) => td.textContent);
const totalRow = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("/invoice/create (SPEC-18 PR 4)", () => {
  it("from a DC: no number, the DC's lines locked at the DC qty and PO rate, totals from the domain (INV-27, INV-29)", async () => {
    api();
    renderApp(`/invoice/create?dc=${DC_ID}`);
    expect(((await screen.findByLabelText("Invoice No.*")) as HTMLInputElement).value).toBe("");
    expect(cells("SYN100010Synthetic part 10")).toEqual([
      "1",
      "SYN100010Synthetic part 10",
      "—",
      "NOS",
      "4",
      "100",
      "₹400",
      "₹36",
      "₹36",
      "₹472",
    ]);
    expect(screen.queryByLabelText("Invoice qty of item 10")).toBeNull();
    expect(totalRow("Taxable Value")).toBe("₹480");
    expect(totalRow("Central Tax")).toBe("₹43.2");
    expect(totalRow("Grand Total")).toBe("₹566.4");
    expect(screen.getAllByRole("link", { name: "17" })[0]?.getAttribute("href")).toBe(`/dc/${DC_ID}`);
  });

  it("saves the DC's lines after confirming and opens the invoice", async () => {
    let body: unknown;
    api({
      "POST /api/invoice": (call) => {
        body = call.body;
        return invoice();
      },
    });
    const { router } = renderApp(`/invoice/create?dc=${DC_ID}`);
    await fill("INV-17");
    fireEvent.change(screen.getByLabelText("SRV No"), { target: { value: "5000101" } });
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/invoice/${INVOICE_ID}`));
    expect(body).toEqual({
      ...HEADER,
      number: "INV-17",
      invoiceDate: "2025-05-03",
      srvNo: "5000101",
      kind: "dc",
      dcId: DC_ID,
      lines: [
        { dcItemId: DC_ITEM_A, qty: "4", rate: "100" },
        { dcItemId: DC_ITEM_B, qty: "2", rate: "40" },
      ],
    });
  });

  it("from a PO: any quantity over the uninvoiced one, the buyer picked from the units (INV-05, INV-31)", async () => {
    let body: unknown;
    api({
      "POST /api/invoice": (call) => {
        body = call.body;
        return invoice({ kind: "direct", dcId: null });
      },
    });
    renderApp(`/invoice/create?po=${PO_ID}`);
    await fill("INV-18");
    expect(screen.getByText("Uninvoiced: 6")).toBeTruthy();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Please ensure Invoice Number and Buyer details are present."),
    );
    const buyer = screen.getByPlaceholderText("Select Buyer...");
    fireEvent.focus(buyer);
    fireEvent.change(buyer, { target: { value: "Example" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Example Buyer Unit/ }));
    expect((screen.getByLabelText("GSTIN") as HTMLInputElement).value).toBe("TESTGSTIN0002");
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Enter quantity greater than zero for at least one PO item."),
    );
    // 8 against 6 uninvoiced: no cap (A-7).
    fireEvent.change(screen.getByLabelText("Invoice qty of item 10"), { target: { value: "8" } });
    expect(totalRow("Grand Total")).toBe("₹944");
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({
      buyerName: "Example Buyer Unit",
      buyerGstin: "TESTGSTIN0002",
      buyerState: "Example State",
      buyerStateCode: "99",
      kind: "direct",
      poId: PO_ID,
      lines: [{ poItemId: ITEM_A, qty: "8" }],
    });
  });

  it("marks a taken number and keeps Save disabled while it is (INV-22)", async () => {
    const calls = api({}, (call) => call.query["number"] === "INV-17");
    renderApp(`/invoice/create?dc=${DC_ID}`);
    await fill("INV-17");
    expect(await screen.findByText("Duplicate number")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(calls.find((c) => c.path === "/api/invoice/number-check")?.query).toEqual({
      number: "INV-17",
      date: "2025-05-03",
    });
  });

  it("shows the API's collision message in place when the save is refused (INV-22)", async () => {
    api({
      "POST /api/invoice": () => fail(409, "invoice-number-taken", "Invoice INV-17 already exists in FY 2025-26."),
    });
    renderApp(`/invoice/create?dc=${DC_ID}`);
    await fill("INV-17");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Invoice INV-17 already exists in FY 2025-26."),
    );
    expect(screen.getByText("Duplicate number")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    // The same number in another FY is free (INV-22).
    const dated = screen.getByLabelText("Dated*");
    fireEvent.change(dated, { target: { value: "03/05/2026" } });
    fireEvent.blur(dated);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(screen.queryByText("Duplicate number")).toBeNull();
  });

  it("an invoice the DC got meanwhile is refused in place without marking the number", async () => {
    api({ "POST /api/invoice": () => fail(409, "dc-has-invoice", "This DC already has an invoice.") });
    renderApp(`/invoice/create?dc=${DC_ID}`);
    await fill("INV-17");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This DC already has an invoice."));
    expect(screen.queryByText("Duplicate number")).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it("without a source, offers the DC/PO search and an empty sheet in the same layout", async () => {
    api();
    renderApp("/invoice/create");
    expect(await screen.findByText("Link a DC or PO to begin")).toBeTruthy();
    expect(screen.getByPlaceholderText("DC/PO Number...")).toBeTruthy();
    expect(screen.getByText("Link a DC or PO to load items.")).toBeTruthy();
    expect(totalRow("Grand Total")).toBe("₹0");
    expect(saveButton().disabled).toBe(true);
  });
});
