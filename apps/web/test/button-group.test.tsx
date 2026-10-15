// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ButtonGroup } from "../src/components/common/index.ts";

afterEach(cleanup);

const OPTIONS = [
  { id: "month", label: "Month" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All", disabled: true },
] as const;

function Period() {
  const [value, setValue] = useState<(typeof OPTIONS)[number]["id"]>("month");
  return (
    <>
      <ButtonGroup label="Period" options={OPTIONS} value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
}

const pressed = (): string[] =>
  screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent ?? "");

describe("ButtonGroup", () => {
  it("is a named group whose chosen option is pressed", () => {
    render(<Period />);
    expect(screen.getByRole("group", { name: "Period" })).toBeTruthy();
    expect(pressed()).toEqual(["Month"]);
  });

  it("choosing an option reports its id; a disabled option cannot be chosen", async () => {
    render(<Period />);
    await userEvent.click(screen.getByRole("button", { name: "30 Days" }));
    expect(screen.getByRole("status").textContent).toBe("30d");
    expect(pressed()).toEqual(["30 Days"]);
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("status").textContent).toBe("30d");
  });
});
