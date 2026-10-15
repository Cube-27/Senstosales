// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { entryAllow } from "../src/components/modules/po/PODetailItems.tsx";
import { renderApp, stubApi } from "./screens.tsx";
import { detail, flag, item, ITEM_A, PO_ID } from "./po-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DETAIL_PATH = `GET /api/po/${PO_ID}`;
const itemRow = (no: number) => screen.getByText(`#${no}`).closest("tr") as HTMLElement;
const cells = (tr: HTMLElement) =>
  within(tr)
    .getAllByRole("cell")
    .map((td) => td.textContent);

describe("entryAllow (INV-46)", () => {
  it.each([
    [{ entryAllowDate: "2025-01-20", entryAllowNote: null }, "20/01/2025"],
    [{ entryAllowDate: null, entryAllowNote: "PO Short Closed" }, "PO Short Closed"],
    [{ entryAllowDate: null, entryAllowNote: null }, "—"],
  ] as const)("%o -> %s", (lot, expected) => {
    expect(entryAllow(lot as Parameters<typeof entryAllow>[0])).toBe(expected);
  });
});

describe("/po/:id (SPEC-16 PR 2)", () => {
  it("shows each item's quantities and status, a cancelled item as Cancelled (INV-63, INV-65)", async () => {
    stubApi({ [DETAIL_PATH]: () => detail() });
    renderApp(`/po/${PO_ID}`);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("4100000101");
    expect(cells(itemRow(10))).toEqual([
      "#10",
      "SYN100010Synthetic valve body",
      "NOS",
      "100.00",
      "10",
      "6",
      "4",
      "2",
      "2",
      "0",
      "Pending",
      "0",
      "1",
    ]);
    expect(cells(itemRow(20))[10]).toBe("Cancelled");
  });

  it("shows a lot's entry-allow note in place of the date (INV-46)", async () => {
    stubApi({ [DETAIL_PATH]: () => detail() });
    renderApp(`/po/${PO_ID}`);
    fireEvent.click(await screen.findByRole("button", { name: "Lots of item 20" }));
    expect(await screen.findByText("Entry PO Short Closed")).toBeTruthy();
  });

  it("highlights a flagged item and marks the manual-adjustment overlap (INV-57, INV-60)", async () => {
    stubApi({
      [DETAIL_PATH]: () =>
        detail({
          flags: [
            flag(),
            flag({
              id: "01J00000000000000000000014",
              type: "MANUAL_ADJUSTMENT_OVERLAP",
              details: { field: "manual_dispatched_qty", expected: null, actual: "4", docIds: [] },
            }),
          ],
        }),
    });
    renderApp(`/po/${PO_ID}`);
    await screen.findByText("#10");
    expect([itemRow(10).dataset["highlighted"], itemRow(20).dataset["highlighted"]]).toEqual(["true", undefined]);
    expect(cells(itemRow(10))[11]).toBe("2");
    expect(
      within(itemRow(10)).getByLabelText("A delivery challan was created after the manual quantity was set"),
    ).toBeTruthy();
    expect(screen.getByText("Discrepancies Detected")).toBeTruthy();
  });

  it("saves the manual dispatched quantity and shows the recomputed Dispatched and Pending (INV-08)", async () => {
    let saved = false;
    const calls = stubApi({
      [DETAIL_PATH]: () =>
        saved
          ? detail({
              items: [item({ manualDispatchedQty: "3", manualNote: "Sent by hand", dspQty: "7", balanceQty: "3" })],
            })
          : detail({ items: [item()] }),
      [`PUT /api/po/${PO_ID}/items/${ITEM_A}/manual-dispatched`]: () => {
        saved = true;
        return item({ manualDispatchedQty: "3", dspQty: "7", balanceQty: "3" });
      },
    });
    renderApp(`/po/${PO_ID}`);
    fireEvent.click(await screen.findByRole("button", { name: "Manual dispatched quantity for item 10" }));
    fireEvent.change(await screen.findByLabelText("Manual dispatched qty"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Sent by hand" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(cells(itemRow(10)).slice(4, 7)).toEqual(["10", "3", "7"]));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ qty: "3", note: "Sent by hand" });
  });

  it("resolves a flag in place, though the refetched page no longer lists it (INV-59, C8)", async () => {
    let acknowledged = false;
    const calls = stubApi({
      // The API lists open flags only: once acknowledged, the flag is gone from the detail.
      [DETAIL_PATH]: () => detail({ flags: acknowledged ? [] : [flag()] }),
      "POST /api/flags/01J00000000000000000000013/acknowledge": () => {
        acknowledged = true;
        return { ...flag(), status: "acknowledged" };
      },
    });
    renderApp(`/po/${PO_ID}`);
    expect(await screen.findByText("Dsp Qty mismatch")).toBeTruthy();
    expect(screen.getByText(/Detected: 02\/02\/2025/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "MARK RESOLVED" }));
    expect(await screen.findByText("Resolved")).toBeTruthy();
    await waitFor(() => expect(calls.filter((c) => c.path === `/api/po/${PO_ID}`).length).toBeGreaterThan(1));
    expect(screen.getByRole("region", { name: "Discrepancies" })).toBeTruthy();
    expect(screen.getByText("Dsp Qty mismatch")).toBeTruthy();
    expect(screen.getByText("Resolved")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ note: null });
  });

  it("shows the header fields read from the PO page by label", async () => {
    stubApi({ [DETAIL_PATH]: () => detail() });
    renderApp(`/po/${PO_ID}`);
    const panel = await screen.findByRole("tabpanel");
    expect(within(panel).getByText("900101")).toBeTruthy();
    expect(within(panel).getByText("Example Engineering Works")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "References" }));
    expect(within(screen.getByRole("tabpanel")).getByText("ENQ-1")).toBeTruthy();
  });
});
