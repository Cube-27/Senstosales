// @vitest-environment jsdom
import type { IsoDate, Qty } from "@senstosales/domain";
import { routes } from "@senstosales/schemas";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  emptyForm,
  formBody,
  formError,
  formFromDetail,
  newItem,
  nextItemNo,
} from "../src/components/modules/po/po-form.ts";
import { renderApp, stubApi } from "./screens.tsx";
import { detail, item, ITEM_B, po, PO_ID } from "./po-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DATE = "2025-03-01" as IsoDate;
const filled = (over: Partial<ReturnType<typeof newItem>> = {}) => ({
  ...newItem([]),
  description: "Valve",
  materialCode: "SYN1",
  unit: "NOS",
  ordQty: 2000 as Qty,
  rate: "848.75",
  ...over,
});

describe("the manual PO form's checks (legacy)", () => {
  it.each([
    ["no PO number", { ...emptyForm(DATE), items: [filled()] }, "PO Number is required"],
    ["no PO date", { ...emptyForm(""), poNumber: "4100000999", items: [filled()] }, "PO Date is required"],
    [
      "an item without a rate",
      { ...emptyForm(DATE), poNumber: "4100000999", items: [filled(), filled({ poItemNo: 20, rate: "" })] },
      "Item 20 has missing mandatory fields (Description, Code, Unit, Qty, Rate)",
    ],
    ["a complete form", { ...emptyForm(DATE), poNumber: "4100000999", items: [filled()] }, null],
  ])("%s", (_, values, expected) => {
    expect(formError(values)).toBe(expected);
  });

  it("numbers new items on the BHEL pattern", () => {
    expect([nextItemNo([]), nextItemNo([{ poItemNo: 10 }, { poItemNo: 30 }])]).toEqual([10, 40]);
  });

  it("numbers a new item above every item the PO ever stored, removed or cancelled ones included", () => {
    // Item 30 was removed from the form, item 40 is cancelled on the PO.
    expect(nextItemNo([{ poItemNo: 10 }, { poItemNo: 20 }], [10, 20, 30, 40])).toBe(50);
  });

  it("leaves cancelled items out of an edit, so saving does not restore them (INV-48, INV-63)", () => {
    const stored = routes["po.detail"].response.parse(
      detail({
        items: [
          item(),
          item({ id: ITEM_B, poItemNo: 20, cancelledAt: "2025-01-10T00:00:00.000Z", status: "Cancelled" }),
        ],
      }),
    );
    const values = formFromDetail(stored);
    expect(formBody(values).items.map((i) => i.poItemNo)).toEqual([10]);
  });
});

describe("formBody", () => {
  it("sends the GEMC rate as typed, GST-inclusive, for the API to derive the net (INV-20)", () => {
    const values = {
      ...emptyForm(DATE),
      poNumber: " 4100000999 ",
      gemcNumber: "GEMC-1",
      gemcDate: "2025-02-10" as IsoDate,
      raw: { ...emptyForm(DATE).raw, supplierCode: "900101", rcNo: "RC/9" },
      items: [filled()],
    };
    expect(formBody(values)).toEqual({
      poNumber: "4100000999",
      poDate: DATE,
      enquiry: null,
      quotation: null,
      orderType: null,
      gemcNumber: "GEMC-1",
      remarks: null,
      rawHeader: { "SUPP CODE": "900101", "RC NO": "RC/9", "GEMC DATE": "10/02/2025" },
      items: [
        {
          poItemNo: 10,
          materialCode: "SYN1",
          description: "Valve",
          drawingNo: null,
          unit: "NOS",
          ordQty: 2000,
          rateSource: 84875000,
          lots: [],
        },
      ],
    });
  });

  it("keeps the stored PO's enquiry and the page labels the form does not show", () => {
    const values = {
      ...emptyForm(DATE),
      poNumber: "4100000999",
      raw: { ...emptyForm(DATE).raw, supplierCode: "900102" },
    };
    const body = formBody(values, { enquiry: "ENQ-1", rawHeader: { "SUPP CODE:": "900101", "PO STATUS": "A" } });
    expect([body.enquiry, body.rawHeader]).toEqual(["ENQ-1", { "PO STATUS": "A", "SUPP CODE": "900102" }]);
  });
});

describe("/po/create (SPEC-16 PR 3)", () => {
  it("creates a PO after confirmation and opens it", async () => {
    const calls = stubApi({
      "POST /api/po": () => po({ isGemc: true, gemcNumber: "GEMC-1" }),
      [`GET /api/po/${PO_ID}`]: () =>
        detail({ po: po({ isGemc: true }), items: [item({ rateSource: "848.75", rate: "719.27966" })] }),
    });
    const { router } = renderApp("/po/create");
    fireEvent.change(await screen.findByLabelText(/PO Number/), { target: { value: "4100000101" } });
    fireEvent.change(screen.getByLabelText("GEMC No"), { target: { value: "GEMC-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    fireEvent.change(screen.getByLabelText("Description of item 1"), { target: { value: "Synthetic valve body" } });
    fireEvent.change(screen.getByLabelText("Code of item 1"), { target: { value: "SYN100010" } });
    fireEvent.change(screen.getByLabelText("Unit of item 1"), { target: { value: "NOS" } });
    fireEvent.change(screen.getByLabelText("Qty of item 1"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Rate of item 1"), { target: { value: "848.75" } });
    expect(screen.getByRole("heading", { level: 1 }).parentElement?.textContent).toContain("1 items • Total: ₹8,487.5");
    fireEvent.click(screen.getByRole("button", { name: "Save PO" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create PO" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/po/${PO_ID}`));
    const sent = calls.find((c) => c.method === "POST")?.body as {
      gemcNumber: string;
      items: { rateSource: string }[];
    };
    expect([sent.gemcNumber, sent.items[0]?.rateSource]).toEqual(["GEMC-1", "848.75"]);
    // The PO page shows the net rate the API stored.
    const row = (await screen.findByText("#10")).closest("tr") as HTMLElement;
    expect(within(row).getByText("719.27966")).toBeTruthy();
  });

  it("shows the legacy message for an incomplete item and sends nothing", async () => {
    const calls = stubApi({});
    renderApp("/po/create");
    fireEvent.change(await screen.findByLabelText(/PO Number/), { target: { value: "4100000101" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    fireEvent.click(screen.getByRole("button", { name: "Save PO" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Item 10 has missing mandatory fields (Description, Code, Unit, Qty, Rate)");
    // In the header beside Save, not in a band of its own over the form (UI-MISC).
    expect(screen.getByRole("button", { name: "Save PO" }).parentElement?.contains(alert)).toBe(true);
    expect(calls).toEqual([]);
  });

  it("edits a stored PO: the form opens filled and saves with the version it read", async () => {
    const calls = stubApi({
      [`GET /api/po/${PO_ID}`]: () => detail({ items: [item()] }),
      [`PUT /api/po/${PO_ID}`]: () => po({ version: 2 }),
    });
    const { router } = renderApp(`/po/create?id=${PO_ID}`);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Edit Purchase Order");
    expect((screen.getByLabelText("Supplier Code") as HTMLInputElement).value).toBe("900101");
    fireEvent.change(screen.getByLabelText("Qty of item 1"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PO" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/po/${PO_ID}`));
    const sent = calls.find((c) => c.method === "PUT")?.body as {
      version: number;
      enquiry: string;
      items: { ordQty: string; rateSource: string; lots: unknown[] }[];
    };
    expect([
      sent.version,
      sent.enquiry,
      sent.items[0]?.ordQty,
      sent.items[0]?.rateSource,
      sent.items[0]?.lots.length,
    ]).toEqual([1, "ENQ-1", "12", "100", 1]);
  });
});
