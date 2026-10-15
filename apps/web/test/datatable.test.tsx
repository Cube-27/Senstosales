// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { type Column, DataTable, type DataTableProps, Pagination } from "../src/components/common/index.ts";

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

type Po = { id: string; number: string; buyer: string; value: string; flagged: boolean };
const po = (n: number): Po => ({
  id: String(n),
  number: `PO-${n}`,
  buyer: n === 2 ? "" : `Buyer ${n} with a long name`,
  value: `${n}00.00`,
  flagged: n === 3,
});
const COLUMNS: Column<Po>[] = [
  { key: "number", header: "PO Number", width: "120px", sortable: true },
  { key: "buyer", header: "Buyer", width: "200px" },
  { key: "value", header: "Value", width: "100px", align: "right", sortable: true, render: (r) => <b>₹{r.value}</b> },
];

function table(overrides: Partial<DataTableProps<Po>> = {}) {
  const props: DataTableProps<Po> = {
    columns: COLUMNS,
    rows: [po(1), po(2), po(3)],
    total: 23,
    page: 3,
    pageSize: 10,
    state: "ready",
    emptyText: "No purchase orders found",
    onPage: vi.fn(),
    onPageSize: vi.fn(),
    onSort: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DataTable {...props} />) };
}

const bodyRows = (): HTMLElement[] => within(screen.getAllByRole("rowgroup")[1] as HTMLElement).queryAllByRole("row");

describe("DataTable", () => {
  it("fixes every column's width and pads a short page to a full page of hidden filler rows", () => {
    const { container } = table();
    expect(container.querySelector("table")?.className).toContain("table-fixed");
    expect(Array.from(container.querySelectorAll("col"), (c) => c.style.width)).toEqual(["120px", "200px", "100px"]);
    const rows = container.querySelectorAll("tbody tr");
    expect(Array.from(rows, (r) => r.getAttribute("aria-hidden"))).toEqual([
      null,
      null,
      null,
      ...Array<string>(7).fill("true"),
    ]);
    expect(Array.from(rows, (r) => (r as HTMLElement).style.height)).toEqual(Array<string>(10).fill("40px"));
    // Filler rows are hidden from assistive tech: only the header row and the 3 real rows are rows.
    expect(screen.getAllByRole("row").length).toBe(4);
  });

  it("shows plain values with a title, an empty value as a dash, and rendered cells as rendered", () => {
    table();
    const [first, second] = bodyRows();
    const cells = within(first as HTMLElement).getAllByRole("cell");
    expect(cells.map((c) => [c.textContent, c.getAttribute("title")])).toEqual([
      ["PO-1", "PO-1"],
      ["Buyer 1 with a long name", "Buyer 1 with a long name"],
      ["₹100.00", null],
    ]);
    expect(within(second as HTMLElement).getAllByRole("cell")[1]?.textContent).toBe("—");
    expect(
      cells.map((c) => c.className.includes("whitespace-nowrap") && c.className.includes("text-ellipsis")),
    ).toEqual([true, true, true]);
  });

  it("uses a column's title for a rendered cell", () => {
    table({ columns: [{ ...COLUMNS[2], title: (r) => `Value ${r.value}` } as Column<Po>] });
    expect(
      within(bodyRows()[0] as HTMLElement)
        .getByRole("cell")
        .getAttribute("title"),
    ).toBe("Value 100.00");
  });

  it("marks highlighted rows", () => {
    table({ rowHighlight: (r) => r.flagged });
    expect(bodyRows().map((r) => r.getAttribute("data-highlighted"))).toEqual([null, null, "true"]);
  });

  it("sorts through a button in each sortable header, with aria-sort on the header cell", () => {
    const { props } = table({ sort: { key: "value", dir: "desc" } });
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.getAttribute("aria-sort"))).toEqual(["none", null, "descending"]);
    expect(within(headers[1] as HTMLElement).queryByRole("button")).toBeNull();
    fireEvent.click(within(headers[0] as HTMLElement).getByRole("button", { name: "PO Number" }));
    expect(vi.mocked(props.onSort).mock.calls).toEqual([["number"]]);
  });

  it.each<[DataTableProps<Po>["state"], Po[] | undefined, string | undefined, string]>([
    ["loading", undefined, undefined, "Loading..."],
    ["ready", [], undefined, "No purchase orders found"],
    ["error", [po(1)], "The server is not responding", "The server is not responding"],
  ])("%s with %j rows: the message fills the reserved body, header and pager stay", (state, rows, error, text) => {
    const { container } = table({ state, rows, error });
    const body = container.querySelectorAll("tbody tr");
    expect(body.length).toBe(1);
    const cell = container.querySelector<HTMLElement>("tbody td");
    expect([cell?.textContent, cell?.style.height]).toEqual([text, "400px"]);
    expect(screen.getAllByRole("columnheader").length).toBe(3);
    expect(screen.getByRole("navigation", { name: "Pagination" }).textContent).toContain("21-23of23");
  });

  it("keeps the rows on screen while the next page loads", () => {
    const { container } = table({ state: "loading" });
    expect([bodyRows().length, container.querySelector("table")?.getAttribute("aria-busy")]).toEqual([3, "true"]);
  });
});

describe("Pagination", () => {
  const NAMES = ["First page", "Previous page", "Next page", "Last page"];
  const pager = (page: number, total: number) => {
    const onPage = vi.fn();
    const onPageSize = vi.fn();
    render(<Pagination page={page} pageSize={10} total={total} onPage={onPage} onPageSize={onPageSize} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    const button = (name: string) => within(nav).getByRole("button", { name }) as HTMLButtonElement;
    return { nav, button, onPage, onPageSize };
  };

  it("shows the row range and page of a middle page and moves by its named buttons", () => {
    const { nav, button, onPage } = pager(2, 2345);
    expect(nav.textContent).toContain("11-20of2,345");
    expect(nav.textContent).toContain("2/235");
    for (const name of NAMES) fireEvent.click(button(name));
    expect(onPage.mock.calls).toEqual([[1], [1], [3], [235]]);
  });

  it("disables backwards on the first page and forwards on the last", () => {
    const first = pager(1, 25);
    expect(NAMES.map((n) => first.button(n).disabled)).toEqual([true, true, false, false]);
    cleanup();
    const last = pager(3, 25);
    expect(last.nav.textContent).toContain("21-25of25");
    expect(NAMES.map((n) => last.button(n).disabled)).toEqual([false, false, true, true]);
  });

  it("reads 0-0 of 0 and page 1 / 1 with no rows", () => {
    const { nav } = pager(1, 0);
    expect(nav.textContent).toContain("0-0of0");
    expect(nav.textContent).toContain("1/1");
  });

  it("keeps the range and page text in fixed-width tabular slots", () => {
    const { nav } = pager(1, 25);
    const slots = Array.from(nav.querySelectorAll("p"), (p) => [
      /\bw-\d+\b/.exec(p.className)?.[0],
      p.className.includes("tabular-nums"),
    ]);
    expect(slots).toEqual([
      ["w-44", true],
      ["w-20", true],
    ]);
  });

  it("changes the page size from the legacy sizes", () => {
    const { nav, onPageSize } = pager(1, 25);
    fireEvent.keyDown(within(nav).getByRole("combobox", { name: "Rows per page" }), { key: "Enter" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["10", "25", "50", "100"]);
    fireEvent.click(screen.getByRole("option", { name: "50" }));
    expect(onPageSize.mock.calls).toEqual([[50]]);
  });

  it.each([
    ["pixel columns only", [], "420px"],
    // A percentage column keeps at least 160px.
    ["a 30% column", [{ key: "note", header: "Note", width: "30%" }], "580px"],
  ])(
    "is wide enough for its columns (%s), so a narrow window scrolls it rather than squeezing one",
    (_, extra, min) => {
      const { container } = table({ columns: [...COLUMNS, ...extra] });
      expect(container.querySelector("table")?.style.minWidth).toBe(min);
    },
  );

  it("runs onRowClick with the clicked row", () => {
    const onRowClick = vi.fn();
    table({ onRowClick });
    fireEvent.click(within(bodyRows()[1] as HTMLElement).getAllByRole("cell")[0] as HTMLElement);
    expect(onRowClick).toHaveBeenCalledWith(po(2));
  });

  describe("selection", () => {
    const selectable = (selected: string[], onChange = vi.fn()) =>
      table({ selection: { rowKey: (r) => r.id, selected: new Set(selected), onChange } });

    it("adds a fixed checkbox column first and checks the selected rows", () => {
      const { container } = selectable(["2"]);
      expect(Array.from(container.querySelectorAll("col"), (c) => c.style.width)).toEqual([
        "40px",
        "120px",
        "200px",
        "100px",
      ]);
      const boxes = bodyRows().map((r) => within(r).getByRole("checkbox"));
      expect(boxes.map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-checked")])).toEqual([
        ["Select row 1", "false"],
        ["Select row 2", "true"],
        ["Select row 3", "false"],
      ]);
    });

    it("toggles a row by its checkbox", () => {
      const onChange = vi.fn();
      selectable(["2"], onChange);
      fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
      expect(onChange).toHaveBeenLastCalledWith(new Set(["2", "1"]));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select row 2" }));
      expect(onChange).toHaveBeenLastCalledWith(new Set());
    });

    it("toggles a row by a click on it, once when the click is on its checkbox", () => {
      const onChange = vi.fn();
      selectable(["2"], onChange);
      fireEvent.click(within(bodyRows()[0] as HTMLElement).getAllByRole("cell")[1] as HTMLElement);
      expect(onChange).toHaveBeenLastCalledWith(new Set(["2", "1"]));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select row 2" }));
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenLastCalledWith(new Set());
    });

    it("leaves a row as it is when the click is on a link in it", () => {
      const onChange = vi.fn();
      table({
        columns: [
          ...COLUMNS,
          { key: "open", header: "Open", width: "80px", render: (r) => <a href={`/po/${r.id}`}>Open</a> },
        ],
        selection: { rowKey: (r) => r.id, selected: new Set(), onChange },
      });
      fireEvent.click(within(bodyRows()[0] as HTMLElement).getByRole("link", { name: "Open" }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("selects nothing from the header while an error hides the rows", () => {
      const onChange = vi.fn();
      table({ state: "error", error: "Down", selection: { rowKey: (r) => r.id, selected: new Set(), onChange } });
      const all = screen.getByRole("checkbox", { name: "Select all rows on this page" });
      expect(all.hasAttribute("disabled")).toBe(true);
      fireEvent.click(all);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("selects every row of the page from the header, and clears them when all are selected", () => {
      const onChange = vi.fn();
      selectable(["9"], onChange);
      const all = screen.getByRole("checkbox", { name: "Select all rows on this page" });
      expect(all.getAttribute("aria-checked")).toBe("false");
      fireEvent.click(all);
      expect(onChange).toHaveBeenLastCalledWith(new Set(["9", "1", "2", "3"]));
      cleanup();
      selectable(["9", "1", "2", "3"], onChange);
      fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
      expect(onChange).toHaveBeenLastCalledWith(new Set(["9"]));
    });

    it("marks the header mixed when only some rows of the page are selected", () => {
      selectable(["1"]);
      expect(screen.getByRole("checkbox", { name: "Select all rows on this page" }).getAttribute("aria-checked")).toBe(
        "mixed",
      );
    });
  });
});
