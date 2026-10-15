// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  Autocomplete,
  Button,
  ConfirmDialog,
  DatePicker,
  FileUploadModal,
  FormField,
  Input,
  QuantityInput,
  StatusBadge,
  type UploadOutcome,
} from "../src/components/common/index.ts";

afterEach(cleanup);

describe("FormField", () => {
  it("names the control by its label and describes it by the help text", () => {
    render(
      <FormField label="PO number" help="As printed on the order" required>
        <Input />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "PO number" });
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "As printed on the order",
    );
  });

  it("replaces the help with the error and marks the control invalid, in the same message slot", () => {
    const { rerender, container } = render(
      <FormField label="Quantity" help="In units">
        <Input />
      </FormField>,
    );
    const slot = container.querySelector("p");
    rerender(
      <FormField label="Quantity" help="In units" error="Enter a quantity above 0">
        <Input />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "Quantity" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Enter a quantity above 0",
    );
    // The same element carries the message, so an error moves nothing below the field (C8).
    expect(container.querySelector("p")).toBe(slot);
  });

  it("keeps an empty message line and no description when there is no help or error", () => {
    const { container } = render(
      <FormField label="Remarks">
        <Input />
      </FormField>,
    );
    expect(screen.getByRole("textbox", { name: "Remarks" }).getAttribute("aria-describedby")).toBeNull();
    expect(container.querySelectorAll("p").length).toBe(1);
  });
});

describe("FormField around the registry controls", () => {
  const described = (control: HTMLElement): string | null | undefined =>
    document.getElementById(control.getAttribute("aria-describedby") ?? "")?.textContent;

  it("names and describes a DatePicker, and keeps its blur and key handlers", () => {
    const onBlur = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <FormField label="PO date" help="As on the PO" error="Enter a date" required>
        <DatePicker value="" onChange={() => {}} onBlur={onBlur} onKeyDown={onKeyDown} />
      </FormField>,
    );
    const box = screen.getByRole("textbox", { name: "PO date" });
    fireEvent.keyDown(box, { key: "a" });
    fireEvent.blur(box);
    expect([
      described(box),
      box.getAttribute("aria-invalid"),
      box.getAttribute("aria-required"),
      onKeyDown.mock.calls.length,
      onBlur.mock.calls.length,
    ]).toEqual(["Enter a date", "true", "true", 1, 1]);
  });

  it("names and describes an Autocomplete", () => {
    render(
      <FormField label="Buyer" help="Pick the buyer" error="Pick a buyer" required>
        <Autocomplete options={OPTIONS} value="" onChange={() => {}} />
      </FormField>,
    );
    const box = screen.getByRole("combobox", { name: "Buyer" });
    expect([described(box), box.getAttribute("aria-invalid"), box.getAttribute("aria-required")]).toEqual([
      "Pick a buyer",
      "true",
      "true",
    ]);
  });
});

describe("Button", () => {
  it("is disabled and shows a spinner while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    expect([(button as HTMLButtonElement).disabled, onClick.mock.calls.length]).toEqual([true, 0]);
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
  });
});

describe("StatusBadge", () => {
  it.each([
    ["success", "Active"],
    ["warning", "Pending"],
    ["neutral", "Inactive"],
    ["pending", "Pending"],
  ] as const)("%s reads %s by default", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label).textContent).toBe(label);
  });

  it("shows its own label over the default", () => {
    const { container } = render(<StatusBadge status="error">Overdue</StatusBadge>);
    expect(container.textContent).toBe("Overdue");
  });
});

function Quantity({ initial, onValue }: { initial: number; onValue(v: number): void }) {
  const [value, setValue] = useState(initial as Parameters<typeof QuantityInput>[0]["value"]);
  return (
    <>
      <QuantityInput
        aria-label="Qty"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
      <Button onClick={() => setValue(0 as typeof value)}>Reset</Button>
    </>
  );
}

describe("QuantityInput", () => {
  it("shows milli-units as units and reports typed quantities as milli-units", () => {
    const onValue = vi.fn();
    render(<Quantity initial={2500} onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Qty" }) as HTMLInputElement;
    expect(input.value).toBe("2.5");
    for (const text of ["1", "1.", "1.25", "", "-3"]) fireEvent.change(input, { target: { value: text } });
    // "1." is no quantity yet, so it reports nothing; empty and negative are 0.
    expect(onValue.mock.calls.map(([v]) => v)).toEqual([1000, 1250, 0, 0]);
  });

  it("is empty at 0 and follows a value set from outside", () => {
    render(<Quantity initial={0} onValue={() => {}} />);
    const input = screen.getByRole("textbox", { name: "Qty" }) as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(input.value).toBe("");
  });

  it("shows the quantity it holds once the field is left", () => {
    const onValue = vi.fn();
    render(<Quantity initial={0} onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Qty" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);
    expect([input.value, onValue.mock.calls]).toEqual(["", [[0]]]);
  });

  it("has no upper limit (C6)", () => {
    const onValue = vi.fn();
    render(<Quantity initial={0} onValue={onValue} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Qty" }), { target: { value: "999999.999" } });
    expect(onValue.mock.calls).toEqual([[999999999]]);
  });
});

function Dated({ initial, onValue }: { initial: string; onValue(v: string): void }) {
  const [value, setValue] = useState(initial as Parameters<typeof DatePicker>[0]["value"]);
  return (
    <DatePicker
      aria-label="PO date"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe("DatePicker", () => {
  it("shows the value as Mon DD, YYYY and commits a typed date on Enter", () => {
    const onValue = vi.fn();
    render(<Dated initial="2019-12-22" onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "PO date" }) as HTMLInputElement;
    expect(input.value).toBe("Dec 22, 2019");
    fireEvent.change(input, { target: { value: "05/01/2025" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect([onValue.mock.calls, input.value]).toEqual([[["2025-01-05"]], "Jan 05, 2025"]);
  });

  it("puts text that is no date back to the current value on blur, and clears on empty", () => {
    const onValue = vi.fn();
    render(<Dated initial="2024-03-01" onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "PO date" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "31/02/2024" } });
    fireEvent.blur(input);
    expect([onValue.mock.calls.length, input.value]).toEqual([0, "Mar 01, 2024"]);
    fireEvent.change(input, { target: { value: " " } });
    fireEvent.blur(input);
    expect([onValue.mock.calls, input.value]).toEqual([[[""]], ""]);
  });

  it("restores the field on Escape", () => {
    render(<Dated initial="2024-03-01" onValue={() => {}} />);
    const input = screen.getByRole("textbox", { name: "PO date" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "garbage" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("Mar 01, 2024");
  });

  it("picks a day from the calendar opened by the named button", () => {
    const onValue = vi.fn();
    render(<Dated initial="2024-03-01" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Open PO date calendar" }));
    fireEvent.click(within(screen.getByRole("grid")).getByText("15"));
    expect(onValue.mock.calls).toEqual([["2024-03-15"]]);
    expect((screen.getByRole("textbox", { name: "PO date" }) as HTMLInputElement).value).toBe("Mar 15, 2024");
  });
});

const OPTIONS = [
  { value: "a", label: "Alpha", subLabel: "First" },
  { value: "b", label: "Beta" },
];

describe("Autocomplete", () => {
  it("lists options on focus and picks one with the keyboard", () => {
    const onChange = vi.fn();
    render(<Autocomplete aria-label="Buyer" options={OPTIONS} value="" onChange={onChange} />);
    const box = screen.getByRole("combobox", { name: "Buyer" });
    fireEvent.focus(box);
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["AlphaFirst", "Beta"]);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange.mock.calls).toEqual([["b", OPTIONS[1]]]);
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  it("picks an option on press and keeps the field focused", () => {
    const onChange = vi.fn();
    render(<Autocomplete aria-label="Buyer" options={OPTIONS} value="" onChange={onChange} />);
    const box = screen.getByRole("combobox", { name: "Buyer" });
    box.focus();
    fireEvent.focus(box);
    const pressed = fireEvent.mouseDown(screen.getByRole("option", { name: /^Alpha/ }));
    expect([pressed, onChange.mock.calls, box.getAttribute("aria-expanded"), document.activeElement === box]).toEqual([
      false,
      [["a", OPTIONS[0]]],
      "false",
      true,
    ]);
  });

  it("shows the chosen label, reports searches and clears with the named button", () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    render(<Autocomplete aria-label="Buyer" options={OPTIONS} value="a" onChange={onChange} onSearch={onSearch} />);
    const box = screen.getByRole("combobox", { name: "Buyer" }) as HTMLInputElement;
    expect(box.value).toBe("Alpha");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Be" } });
    expect(onSearch.mock.calls).toEqual([["Be"]]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange.mock.calls).toEqual([[""]]);
  });

  it("says why the list is empty", () => {
    render(<Autocomplete aria-label="Buyer" options={[]} value="" onChange={() => {}} />);
    const box = screen.getByRole("combobox", { name: "Buyer" });
    fireEvent.focus(box);
    expect(screen.getByRole("listbox").textContent).toBe("Type to search...");
    fireEvent.change(box, { target: { value: "zz" } });
    expect(screen.getByRole("listbox").textContent).toBe("No results found.");
  });
});

describe("ConfirmDialog", () => {
  it("confirms and cancels with its labelled buttons", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete DC?"
        warningText="This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete DC?" });
    expect(within(dialog).getByText("This cannot be undone.").textContent).toBe("This cannot be undone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect([onConfirm.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 1]);
  });

  it("while loading reads Wait... and cannot be closed", () => {
    const onClose = vi.fn();
    render(<ConfirmDialog open loading title="Delete DC?" onConfirm={() => {}} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Wait..." }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose.mock.calls.length).toBe(0);
  });
});

describe("FileUploadModal", () => {
  const file = (name: string): File => new File(["<html></html>"], name, { type: "text/html" });

  it("uploads each file and shows the counts and the reason for each file not accepted", async () => {
    const outcomes: Record<string, UploadOutcome> = {
      "a.html": { status: "accepted", reason: null },
      "b.html": { status: "skipped", reason: "Older than the stored version" },
    };
    const onUpload = vi.fn(async (f: File): Promise<UploadOutcome> => {
      if (f.name === "c.html") throw new Error("Not a BHEL PO page");
      return outcomes[f.name] ?? { status: "failed", reason: null };
    });
    await act(async () => {
      render(
        <FileUploadModal
          open
          files={[file("a.html"), file("b.html"), file("c.html")]}
          onUpload={onUpload}
          onClose={() => {}}
        />,
      );
    });
    const dialog = await screen.findByRole("dialog", { name: "Upload Files" });
    await within(dialog).findByText("Upload Complete");
    expect(onUpload.mock.calls.map(([f]) => f.name)).toEqual(["a.html", "b.html", "c.html"]);
    expect(within(dialog).getByText("3 / 3").textContent).toBe("3 / 3");
    expect(within(dialog).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    const counts = ["Success", "Skipped", "Failed"].map(
      (label) => within(dialog).getByText(label).previousElementSibling?.textContent,
    );
    expect(counts).toEqual(["1", "1", "1"]);
    expect(
      within(within(dialog).getByRole("list", { name: "Files not uploaded" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["b.htmlOlder than the stored version", "c.htmlNot a BHEL PO page"]);
    expect(within(dialog).getByRole("button", { name: "Done" }).textContent).toBe("Done");
  });

  it("with no files is complete and can be closed", async () => {
    const onClose = vi.fn();
    render(<FileUploadModal open files={[]} onUpload={vi.fn()} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Done" }));
    expect([within(dialog).getByText("0 / 0").textContent, onClose.mock.calls.length]).toEqual(["0 / 0", 1]);
  });

  it("stops after the file in flight when cancelled", async () => {
    let release: (o: UploadOutcome) => void = () => {};
    const onUpload = vi.fn(() => new Promise<UploadOutcome>((resolve) => (release = resolve)));
    render(<FileUploadModal open files={[file("a.html"), file("b.html")]} onUpload={onUpload} onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await act(async () => release({ status: "accepted", reason: null }));
    await within(dialog).findByText("Cancelled");
    expect([onUpload.mock.calls.length, within(dialog).getByText("1 / 2").textContent]).toEqual([1, "1 / 2"]);
  });
});
