// @vitest-environment jsdom
import { zListQuery } from "@senstosales/schemas";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { nextSort, pageForSize, useListSearch } from "../src/hooks/useListSearch.ts";

window.scrollTo = () => {};
afterEach(cleanup);

const zSearch = zListQuery(["number", "date"], { q: z.string().optional() });
type Search = z.infer<typeof zSearch>;

function List() {
  const { search, table, setFilters } = useListSearch<Search>();
  return (
    <>
      <output>{JSON.stringify({ ...search, sortProp: table.sort })}</output>
      <button onClick={() => table.onPage(4)}>page 4</button>
      <button onClick={() => table.onPageSize(25)}>25 rows</button>
      <button onClick={() => table.onSort("number")}>sort number</button>
      <button onClick={() => table.onSort("date")}>sort date</button>
      <button onClick={() => setFilters({ q: "valve" })}>filter</button>
    </>
  );
}

async function at(url: string) {
  const root = createRootRoute();
  const list = createRoute({
    getParentRoute: () => root,
    path: "/po",
    validateSearch: (s) => zSearch.parse(s),
    component: List,
  });
  const history = createMemoryHistory({ initialEntries: [url] });
  const router = createRouter({ routeTree: root.addChildren([list]), history });
  render(<RouterProvider router={router} />);
  await screen.findByRole("status");
  const state = async () =>
    JSON.parse((await screen.findByRole("status")).textContent ?? "") as Record<string, unknown>;
  const click = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
  };
  return { router, history, state, click };
}

describe("useListSearch", () => {
  it("reads page, size, sort and filters from the URL, with the list schema's defaults", async () => {
    const { state } = await at("/po?page=3&pageSize=50&sort=date&dir=desc&q=pump");
    expect(await state()).toEqual({
      page: 3,
      pageSize: 50,
      sort: "date",
      dir: "desc",
      q: "pump",
      sortProp: { key: "date", dir: "desc" },
    });
    cleanup();
    expect(await (await at("/po")).state()).toEqual({ page: 1, pageSize: 10, dir: "asc" });
  });

  it("writes each change to the URL, replacing the history entry", async () => {
    const { router, history, state, click } = await at("/po?page=2");
    await click("page 4");
    expect([(await state())["page"], router.state.location.search]).toEqual([4, { page: 4, pageSize: 10, dir: "asc" }]);
    expect(history).toHaveLength(1);
  });

  it("keeps the first row on screen when the page size changes", async () => {
    const { state, click } = await at("/po?page=4");
    await click("25 rows");
    // Rows 31-40 were on screen; row 31 is on page 2 of 25.
    expect(await state()).toMatchObject({ page: 2, pageSize: 25 });
  });

  it("sorts a new column ascending, flips the same column and goes back to page 1", async () => {
    const { state, click } = await at("/po?page=3&sort=date&dir=asc");
    await click("sort date");
    expect(await state()).toMatchObject({ page: 1, sort: "date", dir: "desc" });
    await click("sort number");
    expect(await state()).toMatchObject({ page: 1, sort: "number", dir: "asc" });
  });

  it("merges a filter and goes back to page 1, keeping the sort", async () => {
    const { state, click } = await at("/po?page=3&sort=date&dir=desc");
    await click("filter");
    expect(await state()).toMatchObject({ page: 1, q: "valve", sort: "date", dir: "desc" });
  });
});

describe("pageForSize", () => {
  it.each([
    [4, 10, 25, 2],
    [1, 10, 100, 1],
    [3, 100, 10, 21],
    [2, 25, 10, 3],
  ])("page %i of %i rows is page %i... of %i rows -> %i", (page, from, to, expected) => {
    expect(pageForSize(page, from, to)).toBe(expected);
  });
});

describe("nextSort", () => {
  it.each([
    [{ sort: undefined, dir: "asc" }, "date", { sort: "date", dir: "asc" }],
    [{ sort: "date", dir: "asc" }, "date", { sort: "date", dir: "desc" }],
    [{ sort: "date", dir: "desc" }, "date", { sort: "date", dir: "asc" }],
    [{ sort: "date", dir: "desc" }, "number", { sort: "number", dir: "asc" }],
  ] as const)("%j then %s -> %j", (current, key, expected) => {
    expect(nextSort({ page: 1, pageSize: 10, ...current }, key)).toEqual(expected);
  });
});
