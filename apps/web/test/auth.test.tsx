// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { apiQuery } from "../src/lib/api.ts";
import { safeReturn } from "../src/lib/session.ts";
import { renderApp, reply, signedIn, stubApi } from "./app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SESSION = { authenticated: true, isDefaultPassword: false };

/** Where the app is once it settles: path plus search, as the address bar shows it. */
async function settlesAt(router: ReturnType<typeof renderApp>["router"], href: string): Promise<void> {
  await waitFor(() => expect(router.state.location.href).toBe(href));
}

describe("session gate (SPEC-15 PR 1, INV-78)", () => {
  it("a fresh install opens /onboarding whatever page is asked for", async () => {
    stubApi({ "GET /api/onboarding": { required: true } });
    const { router } = renderApp("/po");
    await settlesAt(router, "/onboarding");
  });

  it("after onboarding, /onboarding redirects away (to the login when signed out)", async () => {
    stubApi(signedIn(false));
    const { router } = renderApp("/onboarding");
    await settlesAt(router, "/auth/login?redirect=%2F");
  });

  it("signed out, a page sends the user to the login with the way back", async () => {
    stubApi(signedIn(false));
    const { router } = renderApp("/po?page=2");
    await settlesAt(router, "/auth/login?redirect=%2Fpo%3Fpage%3D2");
  });

  it("signed in, the login page goes to the page it was asked to return to", async () => {
    stubApi(signedIn(true));
    const { router } = renderApp("/auth/login?redirect=%2Fsrv");
    await settlesAt(router, "/srv");
  });

  it("a signed-out 401 from any read returns to the login, back to the page the user was on", async () => {
    stubApi({ ...signedIn(true), "GET /api/po": reply(401, { code: "signed-out", message: "Please log in." }) });
    const { router, queryClient } = renderApp("/dc");
    await settlesAt(router, "/dc");
    await queryClient.fetchQuery(apiQuery("po.list")).catch(() => {});
    await settlesAt(router, "/auth/login?redirect=%2Fdc");
  });

  it.each([
    ["/po?page=2", "/po?page=2"],
    ["//example.com/x", "/"],
    ["https://example.com", "/"],
    ["/auth/login?redirect=%2Fpo", "/"],
    [undefined, "/"],
  ])("returns only inside the app: %s -> %s", (path, expected) => {
    expect(safeReturn(path)).toBe(expected);
  });
});

describe("login (SPEC-15 PR 1)", () => {
  it("shows the legacy card: fixed username, password, remember me on, Sign In", async () => {
    stubApi(signedIn(false));
    renderApp("/auth/login");
    expect(await screen.findByRole("heading", { name: "Local Access" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Username").value).toBe("admin");
    expect(screen.getByLabelText<HTMLInputElement>("Username").readOnly).toBe(true);
    expect(
      screen.getByRole("checkbox", { name: "Keep me signed in on this device" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.getByText("Local sessions stay signed in until logout, password change, or reset.")).toBeTruthy();
  });

  it("signs in and returns to the page asked for", async () => {
    let session = { authenticated: false, isDefaultPassword: false };
    const calls = stubApi({
      "GET /api/onboarding": { required: false },
      "GET /api/auth/session": () => session,
      "POST /api/auth/login": () => (session = SESSION),
    });
    const { router } = renderApp("/po?page=2");
    await userEvent.type(await screen.findByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await settlesAt(router, "/po?page=2");
    expect(calls.filter((c) => c.route === "POST /api/auth/login").map((c) => c.body)).toEqual([
      { password: "secret", rememberMe: true },
    ]);
  });

  it("sends remember me off when unticked", async () => {
    const calls = stubApi({ ...signedIn(false), "POST /api/auth/login": SESSION });
    renderApp("/auth/login");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Keep me signed in on this device" }));
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.route === "POST /api/auth/login").map((c) => c.body)).toEqual([
        { password: "pw", rememberMe: false },
      ]),
    );
  });

  it("a wrong password shows the server's plain message at the field and stays on the login", async () => {
    stubApi({
      ...signedIn(false),
      "POST /api/auth/login": reply(401, { code: "wrong-password", message: "The password is not correct." }),
    });
    const { router } = renderApp("/auth/login?redirect=%2Fdc");
    await userEvent.type(await screen.findByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("The password is not correct.")).toBeTruthy();
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
    expect(router.state.location.href).toBe("/auth/login?redirect=%2Fdc");
  });

  it("reset to defaults sends the phrase and says the defaults are back", async () => {
    const calls = stubApi({ ...signedIn(false), "POST /api/auth/reset-defaults": { ok: true } });
    renderApp("/auth/login");
    await userEvent.click(await screen.findByRole("button", { name: "Forgot the password? Reset local credentials" }));
    await userEvent.type(screen.getByLabelText("Confirmation Phrase"), "RESET TO DEFAULTS");
    await userEvent.click(screen.getByRole("button", { name: "Reset to Defaults" }));
    expect((await screen.findByText(/^Credentials restored to/)).textContent).toBe(
      "Credentials restored to admin/admin.",
    );
    expect(calls.filter((c) => c.route === "POST /api/auth/reset-defaults").map((c) => c.body)).toEqual([
      { confirmation: "RESET TO DEFAULTS" },
    ]);
  });

  it("a refused reset shows the server's message at the phrase", async () => {
    stubApi({
      ...signedIn(false),
      "POST /api/auth/reset-defaults": reply(400, {
        code: "wrong-phrase",
        message: 'Type "RESET TO DEFAULTS" to continue.',
        details: { fields: [{ path: "body.confirmation", message: 'Type "RESET TO DEFAULTS" to continue.' }] },
      }),
    });
    renderApp("/auth/login");
    await userEvent.click(await screen.findByRole("button", { name: "Forgot the password? Reset local credentials" }));
    await userEvent.type(screen.getByLabelText("Confirmation Phrase"), "reset");
    await userEvent.click(screen.getByRole("button", { name: "Reset to Defaults" }));
    expect(await screen.findByText('Type "RESET TO DEFAULTS" to continue.')).toBeTruthy();
  });
});
