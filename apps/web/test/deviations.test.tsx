// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type Call, renderApp, signedIn, stubApi } from "./app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A ULID ending in `tag`. */
const id = (tag: string): string => `01J${"0".repeat(23 - tag.length)}${tag}`;

const flag = (tag: string, over: Record<string, unknown> = {}) => ({
  id: id(`F${tag}`),
  type: "QTY_MISMATCH",
  scopeType: "srv_item",
  scopeId: id(`M${tag}`),
  poId: id("P1"),
  poNumber: "4500001",
  srvId: id("S1"),
  srvNumber: "7000001",
  details: { field: "ord_qty", expected: "10", actual: "5", docIds: [] },
  status: "open",
  note: null,
  openedAt: "2025-05-06T00:00:00.000Z",
  acknowledgedAt: null,
  ...over,
});

const OVER_DISPATCH = flag("2", {
  type: "OVER_DISPATCH",
  scopeType: "po_item",
  srvId: null,
  srvNumber: null,
  details: { field: "dsp_qty", expected: "10", actual: "12.5", docIds: [] },
  openedAt: "2025-05-07T10:15:30.000Z",
});

function deviationsApi(items: unknown[] = [flag("1"), OVER_DISPATCH]) {
  return stubApi({
    ...signedIn(true),
    "GET /api/flags": { items, total: items.length },
    [`POST /api/flags/${id("F1")}/acknowledge`]: { ...flag("1"), status: "acknowledged" },
  });
}

const lists = (calls: Call[]) => calls.filter((c) => c.route === "GET /api/flags");
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1] as HTMLElement).getAllByRole("row");
const cellTexts = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((c) => c.textContent);

describe("deviations (SPEC-17 PR 1)", () => {
  it("lists the open flags with the legacy columns, plain type labels and links to the PO and SRV", async () => {
    deviationsApi();
    renderApp("/deviations");
    expect(await screen.findByRole("heading", { level: 1, name: "Deviations" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Type",
      "PO",
      "Document",
      "Issue",
      "Expected",
      "Actual",
      "Detected",
      "Status",
      "",
    ]);
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const [first, second] = bodyRows() as [HTMLElement, HTMLElement];
    expect(cellTexts(first)).toEqual([
      "QTY MISMATCH",
      "4500001",
      "SRV 7000001",
      "Ordered qty mismatch: 5 actual vs 10 expected",
      "10",
      "5",
      "06/05/2025, 05:30:00 IST",
      "Open",
      "Resolve",
    ]);
    expect(cellTexts(second)).toEqual([
      "OVER DISPATCH",
      "4500001",
      "PO item",
      "Dsp Qty mismatch",
      "10",
      "12.5",
      "07/05/2025, 15:45:30 IST",
      "Open",
      "Resolve",
    ]);
    expect(within(first).getByRole("link", { name: "4500001" }).getAttribute("href")).toBe(`/po/${id("P1")}`);
    expect(within(first).getByRole("link", { name: "SRV 7000001" }).getAttribute("href")).toBe(`/srv/${id("S1")}`);
  });

  it("asks for open flags by default and for every flag with Show resolved; Clear goes back", async () => {
    const calls = deviationsApi();
    const { router } = renderApp("/deviations");
    await waitFor(() => expect(lists(calls)).toHaveLength(1));
    expect(lists(calls)[0]?.url.searchParams.get("status")).toBe("open");

    await userEvent.click(screen.getByRole("checkbox", { name: "Show resolved" }));
    await waitFor(() => expect(lists(calls)).toHaveLength(2));
    expect(lists(calls)[1]?.url.searchParams.get("status")).toBeNull();
    expect(router.state.location.search).toMatchObject({ resolved: true });

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("resolved"));
    expect(screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled")).toBe(true);
  });

  it("filters by the URL's type and PO, as a link from another screen does", async () => {
    const calls = deviationsApi();
    renderApp(`/deviations?type=OVER_DISPATCH&poId=${id("P1")}`);
    await waitFor(() => expect(lists(calls)).toHaveLength(1));
    const params = lists(calls)[0]?.url.searchParams;
    expect([params?.get("type"), params?.get("poId"), params?.get("status")]).toEqual([
      "OVER_DISPATCH",
      id("P1"),
      "open",
    ]);
  });

  it("searches by PO number once typing pauses", async () => {
    const calls = deviationsApi();
    renderApp("/deviations");
    await userEvent.type(await screen.findByRole("textbox", { name: "Search PO, SRV, type, qty..." }), "4500");
    await waitFor(() => expect(lists(calls).at(-1)?.url.searchParams.get("q")).toBe("4500"));
  });

  it("resolves a flag with an optional note, then reads the list again (INV-59)", async () => {
    const calls = deviationsApi();
    renderApp("/deviations");
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    await userEvent.click(within(bodyRows()[0] as HTMLElement).getByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve deviation?" });
    await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "Checked on site");
    await userEvent.click(within(dialog).getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(lists(calls)).toHaveLength(2));
    expect(calls.filter((c) => c.route.startsWith("POST"))).toEqual([
      expect.objectContaining({ route: `POST /api/flags/${id("F1")}/acknowledge`, body: { note: "Checked on site" } }),
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends no note when the note is left blank", async () => {
    const calls = deviationsApi();
    renderApp("/deviations");
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    await userEvent.click(within(bodyRows()[0] as HTMLElement).getByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve deviation?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.route.startsWith("POST")).map((c) => c.body)).toEqual([{ note: null }]),
    );
  });

  it("shows a resolved flag as Resolved, without a Resolve button", async () => {
    deviationsApi([flag("1", { status: "acknowledged", acknowledgedAt: "2025-05-08T00:00:00.000Z" })]);
    renderApp("/deviations?resolved=true");
    await screen.findByText("Resolved");
    const row = bodyRows()[0] as HTMLElement;
    expect(cellTexts(row).slice(-2)).toEqual(["Resolved", ""]);
    expect(within(row).queryByRole("button")).toBeNull();
  });
});
