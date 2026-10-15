// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  DetailTabs,
  ListToolbar,
  PageHeader,
  StatCard,
  StatCardRow,
  useToast,
} from "../src/components/common/index.ts";
import { ThemeToggle } from "../src/components/common/ThemeToggle.tsx";
import { ToastProvider } from "../src/components/common/Toast.tsx";
import { renderAt } from "./render.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.className = "";
  localStorage.clear();
});

describe("PageHeader", () => {
  it("shows the title as the page heading, the subtitle and the actions", async () => {
    renderAt(<PageHeader title="Purchase Orders" subtitle="All orders" action={<span>actions</span>} backTo="/" />);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Purchase Orders");
    expect(screen.getByText("All orders")).toBeTruthy();
    expect(screen.getByText("actions")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe("/");
  });

  it("a back handler is a button and wins over a back link", async () => {
    const onBack = vi.fn();
    renderAt(<PageHeader title="PO" onBack={onBack} backTo="/po" />);
    fireEvent.click(await screen.findByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: "Go back" })).toBeNull();
  });
});

describe("StatCard", () => {
  it("reads a rupee amount as rupees and shows the trend", () => {
    render(
      <StatCardRow>
        <StatCard title="Total Value" value="-₹1,200.50" trend={{ value: "3 this week", direction: "up" }} />
      </StatCardRow>,
    );
    const summary = screen.getByRole("region", { name: "Page summary" });
    expect(summary.textContent).toBe("Total Value-₹ rupees 1,200.50Trending up:↑3 this week");
  });

  it("is a link with `to`, a button with `onClick`, and plain otherwise", async () => {
    const onClick = vi.fn();
    renderAt(
      <>
        <StatCard title="Open" value={4} to="/po" />
        <StatCard title="Pending" value={2} onClick={onClick} />
        <StatCard title="Closed" value={9} />
      </>,
    );
    expect((await screen.findByRole("link")).getAttribute("href")).toBe("/po");
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Closed").closest("a, button")).toBeNull();
  });
});

describe("DetailTabs", () => {
  function Tabs() {
    const [active, setActive] = useState("items");
    return (
      <DetailTabs
        tabs={[
          { id: "items", label: "Items", badge: 3 },
          { id: "dcs", label: "Challans", badge: 0 },
          { id: "notes", label: "Notes" },
        ]}
        activeTab={active}
        onChange={setActive}
      />
    );
  }

  it("selects the clicked tab and ties it to its panel", () => {
    render(<Tabs />);
    fireEvent.click(screen.getByRole("tab", { name: /Challans/ }));
    const selected = screen.getAllByRole("tab").map((t) => [t.id, t.getAttribute("aria-selected")]);
    expect(selected).toEqual([
      ["items-tab", "false"],
      ["dcs-tab", "true"],
      ["notes-tab", "false"],
    ]);
    expect(screen.getByRole("tab", { name: /Challans/ }).getAttribute("aria-controls")).toBe("dcs-panel");
  });

  it("keeps a zero count's pill mounted but invisible, so the tab keeps its width (C8)", () => {
    render(<Tabs />);
    const pill = (name: RegExp) => screen.getByRole("tab", { name }).querySelector(".rounded-full");
    expect(pill(/Items/)?.className.includes("invisible")).toBe(false);
    expect(pill(/Challans/)?.className.includes("invisible")).toBe(true);
    expect(pill(/Notes/)).toBeNull();
  });
});

describe("ListToolbar", () => {
  it("binds the search box and shows the list's controls", () => {
    const onChange = vi.fn();
    render(
      <ListToolbar search={{ value: "70001", onChange }}>
        <span>filters</span>
      </ListToolbar>,
    );
    const box = screen.getByRole("textbox", { name: "Search" });
    expect((box as HTMLInputElement).value).toBe("70001");
    fireEvent.change(box, { target: { value: "70002" } });
    expect(onChange).toHaveBeenCalledWith("70002");
    expect(screen.getByText("filters")).toBeTruthy();
  });
});

describe("Toast", () => {
  function Raise() {
    const { error } = useToast();
    return (
      <button type="button" onClick={() => error("Save failed", "Number already used in this FY.")}>
        raise
      </button>
    );
  }

  it("shows the title and message, and closes itself after 4 s", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Raise />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "raise" }));
    expect(screen.getByRole("status").textContent).toBe("Save failedNumber already used in this FY.");
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("closes on its close button", () => {
    render(
      <ToastProvider>
        <Raise />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "raise" }));
    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ThemeToggle", () => {
  it("switches to dark and back, and remembers the choice", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: "Dark mode" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect([document.documentElement.classList.contains("dark"), localStorage.getItem("theme")]).toEqual([
      true,
      "dark",
    ]);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect([document.documentElement.classList.contains("dark"), localStorage.getItem("theme")]).toEqual([
      false,
      "light",
    ]);
  });

  it("starts from the remembered theme", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Dark mode" }).getAttribute("aria-pressed")).toBe("true");
  });
});
