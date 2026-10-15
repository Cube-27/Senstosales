// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type Call, fail, renderApp, stubApi } from "./screens.tsx";
import { dc, DC_ID, dcDetail, ITEM_A, ITEM_B, PO_ID, PO_REF, poDetail } from "./doc-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEFAULTS = {
  ourRef: "REF-1",
  departmentNo: null,
  consigneeName: "Example Consignee",
  consigneeGstin: null,
  consigneeAddress: null,
  inspectionCompany: null,
  ewayBillNo: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  modeOfTransport: null,
  remarks: null,
  invoiceNumber: null,
  invoiceDate: null,
  supplierName: "Example Supplier",
  supplierAddress: "1 Example Road",
  supplierGstin: "TESTGSTIN0001",
  supplierContact: "Example Contact",
};

const dispatchableItem = (id: string, no: number, ordQty: string, dspQty: string, balanceQty: string) => ({
  id,
  ordQty,
  dspQty,
  rcdQty: "0",
  balanceQty,
  status: "Pending",
  poItemNo: no,
  materialCode: `SYN1000${no}`,
  description: `Synthetic part ${no}`,
  drawingNo: null,
  unit: "NOS",
  rate: no === 10 ? "100" : "40",
});

const DISPATCHABLE = {
  po: PO_REF,
  defaults: DEFAULTS,
  items: [dispatchableItem(ITEM_A, 10, "10", "4", "6"), dispatchableItem(ITEM_B, 20, "5", "0", "5")],
};

type Handlers = Parameters<typeof stubApi>[0];

function api(extra: Handlers = {}, taken: (call: Call) => boolean = () => false) {
  return stubApi({
    [`GET /api/dc/dispatchable/${PO_ID}`]: () => DISPATCHABLE,
    "GET /api/dc/number-check": (call) => ({ taken: taken(call), financialYear: "2025-26" }),
    [`GET /api/dc/${DC_ID}`]: () => dcDetail(),
    [`GET /api/po/${PO_ID}`]: () => poDetail(),
    ...extra,
  });
}

const typeDate = (label: string, text: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

async function fill(number: string) {
  fireEvent.change(await screen.findByLabelText("DC Number*"), { target: { value: number } });
  typeDate("DC Date*", "02/05/2025");
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save DC" }));

describe("/dc/create (SPEC-18 PR 2)", () => {
  it("starts with no number and every item at 0, showing each item's balance (INV-27)", async () => {
    api();
    renderApp(`/dc/create?po=${PO_ID}`);
    expect(((await screen.findByLabelText("DC Number*")) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("GC Number") as HTMLInputElement).value).toBe("");
    const row = screen.getByRole("cell", { name: "SYN100010Synthetic part 10" }).closest("tr") as HTMLElement;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["10", "SYN100010Synthetic part 10", "NOS", "100", "10", "4", "6", "", "", "₹0"]);
    expect((screen.getByLabelText("Consignee") as HTMLInputElement).value).toBe("Example Consignee");
  });

  it("saves a dispatch over the balance after confirming, GC following the DC number (INV-26, INV-32, C6)", async () => {
    let body: unknown;
    api({
      "POST /api/dc": (call) => {
        body = call.body;
        return dc();
      },
    });
    const { router } = renderApp(`/dc/create?po=${PO_ID}`);
    await fill("17");
    expect((screen.getByLabelText("GC Number") as HTMLInputElement).value).toBe("17");
    // 12 against a balance of 6: no cap; the flag comes back after save (A-7).
    fireEvent.change(screen.getByLabelText("Dispatch qty of item 10"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Packets of item 10"), { target: { value: "3" } });
    expect(screen.getByText("Guarantee Certificate No. 17 Dt. 02/05/2025")).toBeTruthy();
    expect(screen.getByText("Consignment value of BHEL PO: ₹1,200")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Note" }));
    fireEvent.change(screen.getByLabelText("Note 1"), { target: { value: "Packed in two cases" } });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save DC" }) as HTMLButtonElement).disabled).toBe(false),
    );
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Generate DC" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/dc/${DC_ID}`));
    expect(body).toEqual({
      ...DEFAULTS,
      poId: PO_ID,
      number: "17",
      dcDate: "2025-05-02",
      gcNumber: null,
      gcDate: null,
      remarks: "Packed in two cases",
      items: [{ poItemId: ITEM_A, dspQty: "12", packets: 3 }],
    });
  });

  it("marks a taken number and keeps Save disabled while it is (INV-22)", async () => {
    const calls = api({}, (call) => call.query["number"] === "17");
    renderApp(`/dc/create?po=${PO_ID}`);
    await fill("17");
    expect(await screen.findByText("Duplicate number")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save DC" }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls.find((c) => c.path === "/api/dc/number-check")?.query).toEqual({ number: "17", date: "2025-05-02" });
  });

  it("shows the API's collision message in place when the save is refused (INV-22)", async () => {
    api({ "POST /api/dc": () => fail(409, "dc-number-taken", "DC 17 already exists in FY 2025-26.") });
    renderApp(`/dc/create?po=${PO_ID}`);
    await fill("17");
    fireEvent.change(screen.getByLabelText("Dispatch qty of item 20"), { target: { value: "1" } });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save DC" }) as HTMLButtonElement).disabled).toBe(false),
    );
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Generate DC" }));
    expect((await screen.findByText("DC 17 already exists in FY 2025-26.")).closest("[role=alert]")).toBeTruthy();
    expect(screen.getByText("Duplicate number")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a taken GC number is refused in place without marking the DC number", async () => {
    api({ "POST /api/dc": () => fail(409, "gc-number-taken", "GC 17 already exists in FY 2025-26.") });
    renderApp(`/dc/create?po=${PO_ID}`);
    await fill("17");
    fireEvent.change(screen.getByLabelText("Dispatch qty of item 20"), { target: { value: "1" } });
    const saveDc = () => screen.getByRole("button", { name: "Save DC" }) as HTMLButtonElement;
    await waitFor(() => expect(saveDc().disabled).toBe(false));
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Generate DC" }));
    expect((await screen.findByText("GC 17 already exists in FY 2025-26.")).closest("[role=alert]")).toBeTruthy();
    expect(screen.queryByText("Duplicate number")).toBeNull();
    fireEvent.change(screen.getByLabelText("GC Number"), { target: { value: "17A" } });
    expect(saveDc().disabled).toBe(false);
  });

  it("a cleared GC number follows the DC number again, as it is saved (INV-26)", async () => {
    api();
    renderApp(`/dc/create?po=${PO_ID}`);
    await fill("17");
    fireEvent.change(screen.getByLabelText("GC Number"), { target: { value: "" } });
    expect((screen.getByLabelText("GC Number") as HTMLInputElement).placeholder).toBe("17");
    expect(screen.getByText("Guarantee Certificate No. 17 Dt. 02/05/2025")).toBeTruthy();
  });

  it("asks for a quantity before saving", async () => {
    const calls = api();
    renderApp(`/dc/create?po=${PO_ID}`);
    await fill("18");
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save DC" }) as HTMLButtonElement).disabled).toBe(false),
    );
    save();
    expect(screen.getByRole("alert").textContent).toBe("Please dispatch at least one item.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("links a PO picked from the search", async () => {
    const hit = {
      type: "po",
      id: PO_ID,
      number: "4100000101",
      financialYear: null,
      date: "2025-04-05",
      party: null,
      match: "4100000101",
      status: "Pending",
      hasFlags: false,
      qty: null,
      value: null,
      links: { dcs: [], invoices: [], srvs: [], po: null },
    };
    const calls = api({ "GET /api/search": () => [hit] });
    const { router } = renderApp("/dc/create");
    expect(await screen.findByText("Link a PO to begin")).toBeTruthy();
    expect(screen.getByText("Link a PO to load items.")).toBeTruthy();
    const search = screen.getByRole("combobox", { name: "Search PO..." });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "41000" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /4100000101/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ po: PO_ID }));
    expect(await screen.findByText("SYN100020")).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/search")?.query).toEqual({ q: "41000", types: "po" });
  });
});
