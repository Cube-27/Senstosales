// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type FakeApi, renderApp, signedIn, stubApi } from "./app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUPPLIER = {
  id: "01J0000000000000000000000S",
  name: "Example Works",
  gstin: null,
  address: null,
  state: null,
  stateCode: null,
  contact: null,
  email: null,
  bhelSupplierCode: null,
  bankDetails: {},
  invoiceDefaults: {},
};
const BUYER = {
  id: "01J0000000000000000000000B",
  unitName: "Example Unit",
  gstin: "TESTGSTIN0002",
  state: "Tamil Nadu",
  stateCode: "33",
};

function settingsApi(extra: FakeApi = {}, isDefaultPassword = false): FakeApi {
  return {
    ...signedIn(true, isDefaultPassword),
    "GET /api/supplier": SUPPLIER,
    "PUT /api/supplier": (body: unknown) => ({ id: SUPPLIER.id, ...(body as object) }),
    "GET /api/settings": { cgstPct: "9", sgstPct: "9", preferences: {} },
    "PUT /api/settings": (body: unknown) => body,
    "GET /api/buyers": [BUYER],
    "GET /api/settings/bhel-password": { saved: true },
    ...extra,
  };
}

const save = () => screen.getByRole("button", { name: "Save" });
const reason = () => document.getElementById("save-reason")?.textContent;
const routes = (calls: Array<{ route: string }>) => calls.map((c) => c.route).filter((r) => !r.startsWith("GET"));

describe("settings save (SPEC-15 PR 3, INV-72)", () => {
  it("Save is disabled with its reason until something changes", async () => {
    stubApi(settingsApi());
    renderApp("/settings");
    expect(await screen.findByLabelText<HTMLInputElement>("Registered Entity Name")).toBeTruthy();
    await waitFor(() => expect(reason()).toBe("No changes to save"));
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    expect(save().getAttribute("aria-describedby")).toBe("save-reason");
  });

  it("saves only the changed part, through Save, then is clean again", async () => {
    const calls = stubApi(settingsApi());
    renderApp("/settings");
    const name = await screen.findByLabelText("Registered Entity Name");
    await userEvent.type(name, " Ltd");
    await waitFor(() => expect(reason()).toBe(""));
    expect(routes(calls)).toEqual([]);
    await userEvent.click(save());
    await waitFor(() => expect(reason()).toBe("No changes to save"));
    expect(routes(calls)).toEqual(["PUT /api/supplier"]);
    expect(calls.find((c) => c.route === "PUT /api/supplier")?.body).toEqual({
      ...SUPPLIER,
      id: undefined,
      name: "Example Works Ltd",
    });
  });

  it("an invalid rate is shown at its field and Save says where to look", async () => {
    stubApi(settingsApi());
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "System Defaults" }));
    const cgst = await screen.findByLabelText("CGST %");
    await userEvent.clear(cgst);
    await userEvent.type(cgst, "x");
    expect(await screen.findByText('Not a decimal number: "x"')).toBeTruthy();
    expect(reason()).toBe("Fix the highlighted fields in System Defaults");
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it("switching sections keeps unsaved edits", async () => {
    stubApi(settingsApi());
    renderApp("/settings");
    await userEvent.type(await screen.findByLabelText("Phone Number"), "+91 90000 00000");
    await userEvent.click(screen.getByRole("button", { name: "System Defaults" }));
    await userEvent.click(screen.getByRole("button", { name: "Supplier Profile" }));
    expect(screen.getByLabelText<HTMLInputElement>("Phone Number").value).toBe("+91 90000 00000");
  });

  it("leaving with unsaved changes asks first: Stay keeps the page, Leave goes", async () => {
    stubApi(settingsApi());
    const { router } = renderApp("/settings");
    await userEvent.type(await screen.findByLabelText("Primary Email"), "a@example.com");
    await userEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Unsaved changes")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/settings");
    await userEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("a clean page leaves without asking", async () => {
    stubApi(settingsApi());
    const { router } = renderApp("/settings");
    await screen.findByLabelText("Primary Email");
    await userEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("system access (SPEC-15 PR 1 and 3, INV-80, INV-81)", () => {
  it("shows the legacy default-password notice while the default is in use", async () => {
    stubApi(settingsApi({}, true));
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "System Defaults" }));
    expect((await screen.findByRole("note")).textContent).toBe(
      "Default credentials `admin/admin` are still active. Change the password when convenient.",
    );
  });

  it("no notice once the password was changed", async () => {
    stubApi(settingsApi());
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "System Defaults" }));
    await screen.findByText("Access Control");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("change password: mismatched entries are refused in place; a change returns to the login", async () => {
    // The API ends every session on a change, this one included.
    let authenticated = true;
    const calls = stubApi(
      settingsApi({
        "GET /api/auth/session": () => ({ authenticated, isDefaultPassword: false }),
        "POST /api/auth/change-password": () => ((authenticated = false), { ok: true }),
      }),
    );
    const { router } = renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "System Defaults" }));
    await userEvent.type(screen.getAllByLabelText("Current Password")[0]!, "old");
    await userEvent.type(screen.getByLabelText("New Password"), "new");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "other");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(await screen.findByText("The two new passwords do not match.")).toBeTruthy();
    expect(routes(calls)).toEqual([]);
    await userEvent.clear(screen.getByLabelText("Confirm New Password"));
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "new");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/auth/login"));
    expect(calls.find((c) => c.route === "POST /api/auth/change-password")?.body).toEqual({
      currentPassword: "old",
      newPassword: "new",
      confirmPassword: "new",
    });
  });

  it("a reset with unsaved profile edits goes to the login without the unsaved-changes prompt", async () => {
    let authenticated = true;
    stubApi(
      settingsApi({
        "GET /api/auth/session": () => ({ authenticated, isDefaultPassword: false }),
        "POST /api/auth/reset-defaults": () => ((authenticated = false), { ok: true }),
      }),
    );
    const { router } = renderApp("/settings");
    await userEvent.type(await screen.findByLabelText("Primary Email"), "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: "System Defaults" }));
    await userEvent.type(screen.getByLabelText("Confirmation Phrase"), "RESET TO DEFAULTS");
    await userEvent.click(screen.getByRole("button", { name: "Reset to Defaults" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/auth/login"));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("the BHEL password shows only as saved; Change sends it once and it never stays in the page", async () => {
    let saved = false;
    const calls = stubApi(
      settingsApi({
        "GET /api/settings/bhel-password": () => ({ saved }),
        "PUT /api/settings/bhel-password": () => ({ saved: (saved = true) }),
        "DELETE /api/settings/bhel-password": () => ({ saved: (saved = false) }),
      }),
    );
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "System Defaults" }));
    expect(await screen.findByText("Not saved")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    const input = screen.getByLabelText("BHEL Portal Password");
    await userEvent.type(input, "portal-secret");
    await userEvent.click(within(input.closest("form") as HTMLElement).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("portal-secret");
    expect(calls.find((c) => c.route === "PUT /api/settings/bhel-password")?.body).toEqual({
      password: "portal-secret",
    });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Not saved")).toBeTruthy();
  });
});

describe("buyer management (SPEC-15 PR 3)", () => {
  it("lists buyers; adds one with its own Save; name and GSTIN are required", async () => {
    const calls = stubApi(
      settingsApi({
        "POST /api/buyers": (body: unknown) => ({ id: "01J0000000000000000000000C", ...(body as object) }),
      }),
    );
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "Buyer Management" }));
    expect(await screen.findByText("Example Unit")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add Buyer" }));
    const editor = screen.getByText("New Buyer Profile").closest("form") as HTMLElement;
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));
    expect(await within(editor).findAllByText("Name and GSTIN are required")).toHaveLength(2);
    await userEvent.type(within(editor).getByLabelText("Buyer Name"), "Second Unit");
    await userEvent.type(within(editor).getByLabelText("Buyer GSTIN"), "TESTGSTIN0003");
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Second Unit")).toBeTruthy();
    expect(calls.find((c) => c.route === "POST /api/buyers")?.body).toEqual({
      unitName: "Second Unit",
      gstin: "TESTGSTIN0003",
      state: null,
      stateCode: null,
    });
  });

  it("deletes a buyer after the confirmation", async () => {
    const calls = stubApi(settingsApi({ [`DELETE /api/buyers/${BUYER.id}`]: { ok: true } }));
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "Buyer Management" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete buyer" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Are you sure you want to delete this buyer?")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Example Unit")).toBeNull());
    expect(routes(calls)).toEqual([`DELETE /api/buyers/${BUYER.id}`]);
  });
});
