// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderApp, reply, stubApi } from "./app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A fresh install: onboarding is required until it completes. */
function freshInstall(complete: unknown = undefined) {
  let required = true;
  return stubApi({
    "GET /api/onboarding": () => ({ required }),
    "GET /api/auth/session": { authenticated: false, isDefaultPassword: true },
    "POST /api/onboarding": (body: unknown) => {
      if (complete !== undefined) return complete;
      required = false;
      return { id: "01J0000000000000000000000S", ...(body as object) };
    },
  });
}

const labels = (): string[] =>
  screen.getAllByRole<HTMLInputElement>("textbox").map((input) => input.labels?.[0]?.textContent ?? "");

describe("onboarding (SPEC-15 PR 2, INV-78)", () => {
  it("shows the settings layout's profile fields in order and the two GST rates at their defaults", async () => {
    freshInstall();
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Welcome" })).toBeTruthy();
    expect(labels()).toEqual([
      "Registered Entity Name",
      "Phone Number",
      "Primary Email",
      "GSTIN (Tax ID)",
      "Registered Address",
      "Business Tagline / GC Header",
      "CGST %",
      "SGST %",
    ]);
    expect(screen.getByLabelText<HTMLInputElement>("CGST %").value).toBe("9");
    expect(screen.getByLabelText<HTMLInputElement>("SGST %").value).toBe("9");
  });

  it("creates the supplier and the rates in one write, then opens the login", async () => {
    const calls = freshInstall();
    const { router } = renderApp("/");
    await userEvent.type(await screen.findByLabelText("Registered Entity Name"), "Example Works");
    await userEvent.type(screen.getByLabelText("Business Tagline / GC Header"), "Makers of test parts");
    await userEvent.clear(screen.getByLabelText("SGST %"));
    await userEvent.type(screen.getByLabelText("SGST %"), "2.5");
    await userEvent.click(screen.getByRole("button", { name: "Save and Continue" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/auth/login"));
    expect(calls.filter((c) => c.route === "POST /api/onboarding").map((c) => c.body)).toEqual([
      {
        name: "Example Works",
        gstin: null,
        address: null,
        state: null,
        stateCode: null,
        contact: null,
        email: null,
        bhelSupplierCode: null,
        bankDetails: {},
        invoiceDefaults: { description: "Makers of test parts" },
        cgstPct: "9",
        sgstPct: "2.5",
      },
    ]);
  });

  it("a rate that is not a number is shown at its field and nothing is sent", async () => {
    const calls = freshInstall();
    renderApp("/onboarding");
    await userEvent.clear(await screen.findByLabelText("CGST %"));
    await userEvent.type(screen.getByLabelText("CGST %"), "nine");
    await userEvent.click(screen.getByRole("button", { name: "Save and Continue" }));
    expect(await screen.findByText('Not a decimal number: "nine"')).toBeTruthy();
    expect(screen.getByLabelText("CGST %").getAttribute("aria-invalid")).toBe("true");
    expect(calls.some((c) => c.route === "POST /api/onboarding")).toBe(false);
  });

  it("a refused write shows the server's message at the field it names", async () => {
    const message = "Enter the company name.";
    freshInstall(reply(400, { code: "invalid", message, details: { fields: [{ path: "body.name", message }] } }));
    const { router } = renderApp("/onboarding");
    await userEvent.click(await screen.findByRole("button", { name: "Save and Continue" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText("Registered Entity Name").getAttribute("aria-invalid")).toBe("true");
    expect(router.state.location.pathname).toBe("/onboarding");
  });
});
