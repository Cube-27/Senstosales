// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppChrome } from "../src/components/common/index.ts";
import { SidebarNav } from "../src/components/common/SidebarNav.tsx";
import { renderAt } from "./render.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.className = "";
  localStorage.clear();
});

/** Each sidebar group's label and its links' names and targets, in order. */
function sidebarGroups(): Array<[string, Array<[string, string | null]>]> {
  const nav = screen.getByRole("navigation");
  return Array.from(nav.children, (group) => [
    group.querySelector(".role-section-title")?.textContent ?? "",
    within(group as HTMLElement)
      .getAllByRole("link")
      .map((link) => [link.textContent ?? "", link.getAttribute("href")]),
  ]);
}

describe("SidebarNav (INV-67)", () => {
  it("shows the legacy groups and labels, without Sourcing", async () => {
    renderAt(<SidebarNav />);
    await screen.findByRole("navigation");
    expect(sidebarGroups()).toEqual([
      [
        "Core",
        [
          ["Dashboard", "/"],
          ["Purchase Orders", "/po"],
          ["Delivery Challan", "/dc"],
          ["GST Invoices", "/invoice"],
          ["Receipts (SRV)", "/srv"],
        ],
      ],
      [
        "Reports",
        [
          ["Delivery Tracker", "/delivery-tracker"],
          ["Deviations", "/deviations"],
          ["Daily Reports", "/reports"],
        ],
      ],
      [
        "System",
        [
          ["Audit Logs", "/system/ledger"],
          ["Settings", "/settings"],
        ],
      ],
    ]);
    expect(screen.getByRole("link", { name: "Go to Dashboard" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("System Online")).toBeTruthy();
  });

  it.each([
    ["/po/7000123", "Purchase Orders"],
    ["/system/ledger", "Audit Logs"],
    ["/", "Dashboard"],
  ])("on %s marks %s as the current page, and only it", async (path, current) => {
    renderAt(<SidebarNav />, path);
    const nav = await screen.findByRole("navigation");
    const marked = within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(marked.map((l) => l.textContent)).toEqual([current]);
  });
});

describe("AppChrome", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", (url: string) => {
      fetched.push(url);
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });
  });
  const fetched: string[] = [];

  it("frames the page with the sidebar, search, shortcuts and theme toggle", async () => {
    renderAt(
      <AppChrome>
        <p>page body</p>
      </AppChrome>,
      "/po",
    );
    const header = await screen.findByRole("banner");
    expect(within(header).getByRole("button", { name: /Search\.\.\./ })).toBeTruthy();
    expect(
      within(header)
        .getAllByRole("link")
        .map((l) => [l.getAttribute("aria-label"), l.getAttribute("href")]),
    ).toEqual([
      ["Delivery Tracker", "/delivery-tracker"],
      ["Ingest BHEL", "/po/ingest-bhel"],
    ]);
    expect(within(header).getByRole("button", { name: "Logout" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Dark mode" })).toBeTruthy();
    expect(within(screen.getByRole("main")).getByText("page body")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toBeTruthy();
  });

  it("Logout ends the session, says so and goes to the login screen", async () => {
    fetched.length = 0;
    const { router } = renderAt(<AppChrome>body</AppChrome>, "/po");
    await userEvent.click(await screen.findByRole("button", { name: "Logout" }));
    expect(await screen.findByText("Signed Out")).toBeTruthy();
    expect(screen.getByText("Authentication session ended.")).toBeTruthy();
    expect(fetched).toEqual(["/api/auth/logout"]);
    expect(router.state.location.pathname).toBe("/auth/login");
  });

  it("Ctrl+K opens the search dialog and Escape closes it", async () => {
    renderAt(<AppChrome>body</AppChrome>);
    await screen.findByRole("banner");
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Quick Search" });
    expect(within(dialog).getByPlaceholderText("Search POs, Challans, Invoices or SRVs...")).toBeTruthy();
    expect(within(dialog).getByText("Type to search")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
