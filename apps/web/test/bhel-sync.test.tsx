// @vitest-environment jsdom
// SPEC-19 PR 5: the BHEL sync screen over a fake API. Captcha (asked again in place when wrong), OTP, Start with the
// session, and the login over once the job ends (D-0379); a refused start shows its plain message.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type FakeApi, renderApp, reply, signedIn, stubApi } from "./app.tsx";
import { job, SUPPLIER } from "./wire-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SESSION = "01J00000000000000000000SES";
const JOB = job({ type: "po.scrape" });
const DONE = {
  ...JOB,
  status: "done",
  progress: { total: 2, done: 1, skipped: 0, failed: 1, current: null },
  summary: { skippedDocuments: [], failedDocuments: [{ document: "4500003", reason: "Page not found" }], flags: {} },
};

function syncApi(extra: FakeApi = {}): FakeApi {
  return {
    ...signedIn(true),
    "GET /api/supplier": { ...SUPPLIER, bhelSupplierCode: "TEST-001" },
    "GET /api/settings/bhel-password": { saved: true },
    "POST /api/bhel/session": { sessionId: SESSION, captchaPng: "iVBORw==" },
    ...extra,
  };
}

const dialog = () => screen.findByRole("dialog");
const title = async () => within(await dialog()).getByRole("heading").textContent;

async function logIn() {
  await userEvent.click(await screen.findByRole("button", { name: "Login to BHEL" }));
  await waitFor(async () => expect(await title()).toBe("Enter CAPTCHA"));
  await userEvent.type(screen.getByLabelText("CAPTCHA code"), "AB12C");
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(async () => expect(await title()).toBe("Enter OTP"));
  await userEvent.type(screen.getByLabelText("OTP code"), "123456");
  await userEvent.click(screen.getByRole("button", { name: "Submit OTP" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("BHEL sync screen (SPEC-19 PR 5)", () => {
  it("shows the supplier code and the password only as saved, with a link to Settings", async () => {
    stubApi(syncApi());
    renderApp("/po/ingest-bhel");
    expect(await screen.findByRole("heading", { name: "B2B Supply Chain Ingestion" })).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>("Supplier Code").value).toBe("TEST-001"));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change in Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true);
  });

  it("asks again in place after a wrong captcha, then takes the OTP and starts the scrape with the session", async () => {
    let captchas = 0;
    const calls = stubApi(
      syncApi({
        [`POST /api/bhel/session/${SESSION}/captcha`]: () =>
          ++captchas === 1
            ? { step: "captcha", captchaPng: "AAAA", message: "The captcha was wrong. Type the new one." }
            : { step: "otp", message: null },
        [`POST /api/bhel/session/${SESSION}/otp`]: { step: "ready" },
        "POST /api/jobs": JOB,
        [`GET /api/jobs/${JOB.id}`]: { job: DONE, events: [] },
      }),
    );
    renderApp("/po/ingest-bhel");
    await userEvent.click(await screen.findByRole("button", { name: "Login to BHEL" }));
    await waitFor(async () => expect(await title()).toBe("Enter CAPTCHA"));
    await userEvent.type(screen.getByLabelText("CAPTCHA code"), "WRONG");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("The captcha was wrong. Type the new one.")).toBeTruthy();
    expect(screen.getByRole<HTMLImageElement>("img", { name: "CAPTCHA" }).src).toBe("data:image/png;base64,AAAA");
    expect(screen.getByLabelText<HTMLInputElement>("CAPTCHA code").value).toBe("");

    await userEvent.type(screen.getByLabelText("CAPTCHA code"), "AB12C");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(async () => expect(await title()).toBe("Enter OTP"));
    await userEvent.type(screen.getByLabelText("OTP code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Submit OTP" }));
    expect(await screen.findByText("Authenticated")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(calls.find((c) => c.route === "POST /api/jobs")?.body).toEqual({
      type: "po.scrape",
      sessionId: SESSION,
      limit: 1,
    });
    expect(calls.filter((c) => c.route.includes("/captcha")).map((c) => c.body)).toEqual([
      { captcha: "WRONG" },
      { captcha: "AB12C" },
    ]);
    // The job closed the session when it ended: Done, the failed page listed, and the login is over.
    expect(await screen.findByRole("heading", { name: "Done" })).toBeTruthy();
    expect(screen.getByText("4500003")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Login to BHEL" })).toBeTruthy();
    expect(screen.queryByText("Authenticated")).toBeNull();
  });

  it("an SRV run sends the PO filter as ids", async () => {
    const calls = stubApi(
      syncApi({
        [`POST /api/bhel/session/${SESSION}/captcha`]: { step: "otp", message: null },
        [`POST /api/bhel/session/${SESSION}/otp`]: { step: "ready" },
        "POST /api/jobs": { ...JOB, type: "srv.scrape" },
        [`GET /api/jobs/${JOB.id}`]: { job: { ...JOB, type: "srv.scrape", status: "running" }, events: [] },
      }),
    );
    renderApp("/po/ingest-bhel");
    await userEvent.click(await screen.findByRole("button", { name: "SRV Ingestion" }));
    await logIn();
    await userEvent.type(screen.getByLabelText("PO Filter For SRV Lookup"), "4500001, 45X");
    expect(await screen.findByText("Not a PO number: 45X")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true);
    await userEvent.type(screen.getByLabelText("PO Filter For SRV Lookup"), "{Backspace}{Backspace}{Backspace}4500002");
    expect(screen.getByText("2 POs specified")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(calls.find((c) => c.route === "POST /api/jobs")?.body).toEqual({
        type: "srv.scrape",
        sessionId: SESSION,
        poIds: ["4500001", "4500002"],
      }),
    );
  });

  it("a refused login says why in plain words, and Cancel closes the dialog", async () => {
    stubApi(
      syncApi({
        "POST /api/bhel/session": reply(409, {
          code: "edge-unavailable",
          message: "BHEL sync needs Microsoft Edge. Folder import still works.",
        }),
      }),
    );
    renderApp("/po/ingest-bhel");
    await userEvent.click(await screen.findByRole("button", { name: "Login to BHEL" }));
    await waitFor(async () => expect(await title()).toBe("Login Failed"));
    expect(within(await dialog()).getByText("BHEL sync needs Microsoft Edge. Folder import still works.")).toBeTruthy();
    expect(within(await dialog()).getByRole("button", { name: "Try Again" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Reset after a run ends the login the job closed: Login to BHEL again, Start disabled", async () => {
    const calls = stubApi(
      syncApi({
        [`POST /api/bhel/session/${SESSION}/captcha`]: { step: "otp", message: null },
        [`POST /api/bhel/session/${SESSION}/otp`]: { step: "ready" },
        "POST /api/jobs": JOB,
        [`GET /api/jobs/${JOB.id}`]: { job: DONE, events: [] },
        [`DELETE /api/bhel/session/${SESSION}`]: { ok: true },
      }),
    );
    renderApp("/po/ingest-bhel");
    await logIn();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("heading", { name: "Done" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByRole("heading", { name: "PO Standby" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Login to BHEL" })).toBeTruthy();
    expect(screen.queryByText("Authenticated")).toBeNull();
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true);
    expect(calls.filter((c) => c.route === "POST /api/jobs")).toHaveLength(1);
  });

  it("Cancel while connecting: the late session is closed and the dialog stays shut", async () => {
    let open: (value: unknown) => void = () => {};
    const calls = stubApi(
      syncApi({
        "POST /api/bhel/session": () => new Promise((resolve) => (open = resolve)),
        [`DELETE /api/bhel/session/${SESSION}`]: { ok: true },
      }),
    );
    renderApp("/po/ingest-bhel");
    await userEvent.click(await screen.findByRole("button", { name: "Login to BHEL" }));
    await waitFor(async () => expect(await title()).toBe("Connecting to BHEL…"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    open({ sessionId: SESSION, captchaPng: "iVBORw==" });
    await waitFor(() => expect(calls.some((c) => c.route === `DELETE /api/bhel/session/${SESSION}`)).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Login to BHEL" })).toBeTruthy();
  });

  it("Cancel while a captcha is out: its late answer changes nothing", async () => {
    let answer: (value: unknown) => void = () => {};
    stubApi(
      syncApi({
        [`POST /api/bhel/session/${SESSION}/captcha`]: () => new Promise((resolve) => (answer = resolve)),
        [`DELETE /api/bhel/session/${SESSION}`]: { ok: true },
      }),
    );
    renderApp("/po/ingest-bhel");
    await userEvent.click(await screen.findByRole("button", { name: "Login to BHEL" }));
    await waitFor(async () => expect(await title()).toBe("Enter CAPTCHA"));
    await userEvent.type(screen.getByLabelText("CAPTCHA code"), "AB12C");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    answer({ step: "otp", message: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Authenticated")).toBeNull();
  });

  it("Logout closes the portal session", async () => {
    const calls = stubApi(
      syncApi({
        [`POST /api/bhel/session/${SESSION}/captcha`]: { step: "otp", message: null },
        [`POST /api/bhel/session/${SESSION}/otp`]: { step: "ready" },
        [`DELETE /api/bhel/session/${SESSION}`]: { ok: true },
      }),
    );
    renderApp("/po/ingest-bhel");
    await logIn();
    const auth = screen.getByRole("region", { name: "Authentication" });
    await userEvent.click(within(auth).getByRole("button", { name: "Logout" }));
    expect(await screen.findByRole("button", { name: "Login to BHEL" })).toBeTruthy();
    expect(calls.some((c) => c.route === `DELETE /api/bhel/session/${SESSION}`)).toBe(true);
  });
});
