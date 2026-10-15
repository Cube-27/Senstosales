// @vitest-environment jsdom
// SPEC-21 PR 3: Backup now and Restore in Settings, System Defaults (§2, ARCHITECTURE §13.3).
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type FakeApi, renderApp, reply, signedIn, stubApi } from "./app.tsx";
import { job, SUPPLIER } from "./wire-fixtures.ts";

const reloadApp = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/reload.ts", () => ({ reloadApp }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  reloadApp.mockReset();
});

const JOB = job();
const BACKUPS = [
  { name: "safety-20261015T040000Z.db", kind: "safety" },
  { name: "daily-2026-10-14.db", kind: "daily" },
  { name: "pre-upgrade-3-20261001T030000Z.db", kind: "pre-upgrade" },
];

function settingsApi(extra: FakeApi = {}): FakeApi {
  return {
    ...signedIn(true),
    "GET /api/supplier": SUPPLIER,
    "GET /api/settings": { cgstPct: "9", sgstPct: "9", preferences: {} },
    "GET /api/buyers": [],
    "GET /api/settings/bhel-password": { saved: false },
    "GET /api/backups": BACKUPS,
    ...extra,
  };
}

async function openBackups() {
  renderApp("/settings");
  await userEvent.click(await screen.findByRole("button", { name: "System Defaults" }));
  return screen.findByRole("region", { name: "Backups" });
}

const names = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).queryAllByRole("cell")[0]?.textContent);

describe("Settings backups (SPEC-21 PR 3)", () => {
  it("lists the backups newest first with their kind in plain words", async () => {
    stubApi(settingsApi());
    const panel = await openBackups();
    await waitFor(() =>
      expect(names(panel)).toEqual([
        "safety-20261015T040000Z.db",
        "daily-2026-10-14.db",
        "pre-upgrade-3-20261001T030000Z.db",
      ]),
    );
    const kinds = within(panel)
      .getAllByRole("row")
      .slice(1, 4)
      .map((row) => within(row).getAllByRole("cell")[1]?.textContent);
    expect(kinds).toEqual(["Before restore", "Daily", "Before upgrade"]);
  });

  it("Backup now starts the backup job, waits for it and lists the new copy", async () => {
    let listed = BACKUPS;
    const calls = stubApi(
      settingsApi({
        "GET /api/backups": () => listed,
        "POST /api/jobs": { ...JOB },
        [`GET /api/jobs/${JOB.id}`]: () => {
          listed = [{ name: "daily-2026-10-15.db", kind: "daily" }, ...BACKUPS];
          return { job: { ...JOB, status: "done" }, events: [] };
        },
      }),
    );
    const panel = await openBackups();
    await userEvent.click(within(panel).getByRole("button", { name: "Backup now" }));
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("Backup saved."));
    expect(calls.find((c) => c.route === "POST /api/jobs")?.body).toEqual({ type: "backup" });
    await waitFor(() => expect(names(panel)[0]).toBe("daily-2026-10-15.db"));
  });

  it("a backup that fails says why", async () => {
    stubApi(
      settingsApi({
        "POST /api/jobs": reply(409, {
          code: "job-running",
          message: "Another job is running. Wait for it to finish.",
        }),
      }),
    );
    const panel = await openBackups();
    await userEvent.click(within(panel).getByRole("button", { name: "Backup now" }));
    await waitFor(() =>
      expect(within(panel).getByRole("status").textContent).toBe("Another job is running. Wait for it to finish."),
    );
  });

  it("Restore asks first in plain words, restores the chosen backup and reloads the app", async () => {
    const calls = stubApi(
      settingsApi({
        "POST /api/backups/restore": { restored: "daily-2026-10-14.db", safety: "safety-20261015T050000Z.db" },
      }),
    );
    const panel = await openBackups();
    const row = (await within(panel).findByText("daily-2026-10-14.db")).closest("tr");
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Restore this backup?");
    expect(dialog.textContent).toContain(
      "Your current data will be replaced by daily-2026-10-14.db. A copy of your current data is saved first.",
    );
    expect(calls.some((c) => c.route === "POST /api/backups/restore")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(1));
    expect(calls.find((c) => c.route === "POST /api/backups/restore")?.body).toEqual({ name: "daily-2026-10-14.db" });
  });

  it("a refused restore keeps the page and says why", async () => {
    stubApi(
      settingsApi({
        "POST /api/backups/restore": reply(409, {
          code: "job-running",
          message: "A job is running. Wait for it to finish, then restore.",
        }),
      }),
    );
    const panel = await openBackups();
    const row = (await within(panel).findByText("daily-2026-10-14.db")).closest("tr");
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "Restore" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(within(panel).getByRole("status").textContent).toBe(
        "A job is running. Wait for it to finish, then restore.",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reloadApp).not.toHaveBeenCalled();
  });
});
