// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderApp, signedIn, stubApi } from "./app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const id = (tail: string): string => `01J${"0".repeat(23 - tail.length)}${tail}`;
const NO_LINKS = { dcs: [], invoices: [], srvs: [], po: null };

const hit = (over: Record<string, unknown>) => ({
  financialYear: null,
  date: "2025-04-10",
  party: null,
  status: null,
  hasFlags: false,
  qty: null,
  value: null,
  links: NO_LINKS,
  ...over,
});

const HITS = [
  hit({
    type: "po",
    id: id("PA1"),
    number: "4500012",
    match: "4500012",
    status: "Pending",
    qty: "1200",
    value: "250000",
    hasFlags: true,
    links: {
      dcs: [{ id: id("DC1"), number: "12", date: "2025-05-01", financialYear: "2025-26" }],
      invoices: [{ id: id("NV1"), number: "12", date: "2025-05-02", financialYear: "2025-26" }],
      srvs: [{ id: id("SV1"), number: "800012", date: "2025-05-20" }],
      po: null,
    },
  }),
  hit({ type: "dc", id: id("DC1"), number: "12", match: "12", financialYear: "2025-26" }),
  hit({ type: "invoice", id: id("NV1"), number: "12", match: "12", financialYear: "2025-26" }),
  hit({ type: "srv", id: id("SV1"), number: "800012", match: "800012" }),
];

function searchApi(answer: (url: URL) => unknown = () => HITS) {
  const urls: URL[] = [];
  const calls = stubApi({
    ...signedIn(true),
    "GET /api/dashboard/summary": {
      poValue: "0",
      invoicedValue: "0",
      avgLeadTimeDays: null,
      overdueCount: 0,
      uninvoicedDcCount: 0,
      openFlagCount: 0,
      pendingDispatchValue: "0",
      funnel: { ordQty: "0", dspQty: "0", invoicedQty: "0", rcdQty: "0", pendingQty: "0" },
    },
    "GET /api/dashboard/activity": [],
    "GET /api/search": (_body: unknown, url: URL) => {
      urls.push(url);
      return answer(url);
    },
  });
  return { calls, urls };
}

async function openSearch(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: /Search\.\.\./ }));
  return screen.findByRole("dialog", { name: "Quick Search" });
}

const optionTexts = (dialog: HTMLElement): string[] =>
  within(dialog)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "");

describe("global search (SPEC-15 PR 5, INV-24)", () => {
  it("finds PO, DC, invoice and SRV numbers; DC and invoice hits carry their FY", async () => {
    const { urls } = searchApi();
    renderApp("/");
    const dialog = await openSearch();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Search POs/ }), "12");
    await waitFor(() =>
      expect(optionTexts(dialog)).toEqual([
        "PO 4500012",
        "DC 12 · FY 2025-26",
        "Invoice 12 · FY 2025-26",
        "SRV 800012",
      ]),
    );
    expect(urls.map((u) => u.search)).toEqual(["?q=12"]);
  });

  it("previews the chosen hit: status, discrepancies, quantity, value and linked documents with FY", async () => {
    searchApi();
    renderApp("/");
    const dialog = await openSearch();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Search POs/ }), "4500012");
    expect(await within(dialog).findByRole("heading", { name: "PO 4500012" })).toBeTruthy();
    expect(within(dialog).getByText("10/04/2025")).toBeTruthy();
    expect(within(dialog).getByText("Pending")).toBeTruthy();
    expect(within(dialog).getByText("Has discrepancies")).toBeTruthy();
    expect(within(dialog).getByText("1,200")).toBeTruthy();
    expect(within(dialog).getByText("₹2.50L")).toBeTruthy();
    expect(
      ["DC #12 · FY 2025-26", "INV #12 · FY 2025-26", "SRV #800012"].map(
        (name) => within(dialog).getByRole("button", { name }) !== null,
      ),
    ).toEqual([true, true, true]);
  });

  it("arrow keys choose a hit and Enter opens its page and closes the dialog", async () => {
    searchApi();
    const { router } = renderApp("/");
    const dialog = await openSearch();
    const box = within(dialog).getByRole("textbox", { name: /Search POs/ });
    await userEvent.type(box, "12");
    await within(dialog).findAllByRole("option");
    await userEvent.keyboard("{ArrowDown}");
    expect(within(dialog).getByRole("option", { selected: true }).textContent).toBe("DC 12 · FY 2025-26");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/dc/${id("DC1")}`));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a focused hit opens its own page on Enter, not the selected one", async () => {
    searchApi();
    const { router } = renderApp("/");
    const dialog = await openSearch();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Search POs/ }), "12");
    const options = await within(dialog).findAllByRole("option");
    options[1]?.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/dc/${id("DC1")}`));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a linked document opens its page", async () => {
    searchApi();
    const { router } = renderApp("/");
    const dialog = await openSearch();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Search POs/ }), "4500012");
    await userEvent.click(await within(dialog).findByRole("button", { name: "SRV #800012" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/srv/${id("SV1")}`));
  });

  it("says when nothing matches", async () => {
    searchApi(() => []);
    renderApp("/");
    const dialog = await openSearch();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Search POs/ }), "999");
    expect(await within(dialog).findByText("No results found")).toBeTruthy();
  });

  it("filters by document type; the Filters toggle stays pressed while a filter is set", async () => {
    const { urls } = searchApi();
    renderApp("/");
    const dialog = await openSearch();
    const toggle = within(dialog).getByRole("button", { name: "Toggle filters" });
    await userEvent.click(toggle);
    for (const name of ["Purchase Orders", "Invoices", "SRVs"]) {
      await userEvent.click(within(dialog).getByRole("button", { name }));
    }
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Search POs/ }), "12");
    await waitFor(() => expect(urls.at(-1)?.search).toBe("?q=12&types=dc"));
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the loading indicator's slot and the previous results while the next search runs (C8)", async () => {
    let release: () => void = () => {};
    const held = new Promise((resolve) => (release = () => resolve([HITS[3]])));
    // Keyed by the text, not the call count: slow typing may search a prefix first.
    searchApi((url) => (url.searchParams.get("q") === "123" ? held : HITS));
    renderApp("/");
    const dialog = await openSearch();
    expect(within(dialog).queryByLabelText("Searching")).toBeNull();
    const box = within(dialog).getByRole("textbox", { name: /Search POs/ });
    await userEvent.type(box, "12");
    await waitFor(() => expect(optionTexts(dialog)).toHaveLength(4));
    await userEvent.type(box, "3");
    await waitFor(() => expect(within(dialog).getByLabelText("Searching")).toBeTruthy());
    expect(optionTexts(dialog)).toHaveLength(4);
    release();
    await waitFor(() => expect(optionTexts(dialog)).toEqual(["SRV 800012"]));
  });

  it("remembers answered searches and offers them when the box is empty", async () => {
    searchApi();
    renderApp("/");
    const dialog = await openSearch();
    const box = within(dialog).getByRole("textbox", { name: /Search POs/ });
    await userEvent.type(box, "4500012");
    await within(dialog).findAllByRole("option");
    await userEvent.clear(box);
    expect(await within(dialog).findByText("Recent Searches")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /^4500012/ })).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("sensto_recent_searches") ?? "[]").map((r: { query: string }) => r.query),
    ).toEqual(["4500012"]);
  });

  it("saves the filters under a name and loads them back from Saved searches", async () => {
    const { urls } = searchApi();
    renderApp("/");
    const dialog = await openSearch();
    await userEvent.click(within(dialog).getByRole("button", { name: "Toggle filters" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "SRVs" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save Search" }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search name" }), "No SRVs");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear all" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Saved searches" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "No SRVs" }));
    await waitFor(() => expect(urls.at(-1)?.search).toBe("?q=&types=po&types=dc&types=invoice"));
  });
});
