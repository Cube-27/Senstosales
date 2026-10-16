// SPEC-20 PR 5: the update offer. The shell downloads a newer release in the background, asks once, and only then
// stops the sidecar and starts the installer. A failed check or download stays in the log; the next start tries again.
import { describe, expect, it } from "vite-plus/test";

import { offerUpdate, type Update } from "../src/update.ts";

const QUESTION =
  "SenstoSales 1.2.0 is ready to install. Install it now?\n\nSenstoSales will close while it installs. Your data stays where it is.";

/** Fakes that record every step in order; `fail` makes that step throw. */
function harness({ found = true, answer = true, fail }: { found?: boolean; answer?: boolean; fail?: string } = {}) {
  const steps: string[] = [];
  const step = async (name: string) => {
    steps.push(name);
    if (fail === name) throw new Error(`${name} broke`);
  };
  const update: Update = { version: "1.2.0", download: () => step("download"), install: () => step("install") };
  const deps = {
    check: async () => {
      await step("check");
      return found ? update : null;
    },
    ask: async (message: string) => {
      steps.push(`ask: ${message}`);
      return answer;
    },
    stopSidecar: () => step("stop sidecar"),
    quit: () => step("quit"),
    log: async (line: string) => void steps.push(`log: ${line}`),
  };
  return { steps, deps };
}

describe("offerUpdate", () => {
  it("downloads first, asks, then stops the sidecar, installs and quits", async () => {
    const { steps, deps } = harness();
    await offerUpdate(deps);
    expect(steps).toEqual(["check", "download", `ask: ${QUESTION}`, "stop sidecar", "install", "quit"]);
  });

  it("does nothing more when this is the latest version", async () => {
    const { steps, deps } = harness({ found: false });
    await offerUpdate(deps);
    expect(steps).toEqual(["check"]);
  });

  it("keeps the app running when the user says no", async () => {
    const { steps, deps } = harness({ answer: false });
    await offerUpdate(deps);
    expect(steps).toEqual(["check", "download", `ask: ${QUESTION}`]);
  });

  it("only logs a failed check, without asking", async () => {
    const { steps, deps } = harness({ fail: "check" });
    await offerUpdate(deps);
    expect(steps).toEqual(["check", "log: update check failed: check broke"]);
  });

  it("only logs a failed download, without asking", async () => {
    const { steps, deps } = harness({ fail: "download" });
    await offerUpdate(deps);
    expect(steps).toEqual(["check", "download", "log: update check failed: download broke"]);
  });

  it("passes an install failure to the caller after the sidecar has stopped", async () => {
    const { steps, deps } = harness({ fail: "install" });
    await expect(offerUpdate(deps)).rejects.toThrow("install broke");
    expect(steps).toEqual(["check", "download", `ask: ${QUESTION}`, "stop sidecar", "install"]);
  });
});
