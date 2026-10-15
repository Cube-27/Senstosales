// SPEC-20 PR 2: watching the sidecar. Ready means the `SENSTO_PORT=<n>` line (ADR 0001); an exit before it reports the
// sidecar's last plain message, and an exit at any time is reported once.
import { describe, expect, it } from "vite-plus/test";

import { type SidecarOutput, watchSidecar } from "../src/sidecar.ts";

type Listener<T> = (value: T) => void;

/** A stand-in for plugin-shell's `Command`: the test emits its lines and its close. */
function fakeCommand() {
  const out: Array<Listener<string>> = [];
  const err: Array<Listener<string>> = [];
  const close: Array<Listener<{ code: number | null }>> = [];
  const command: SidecarOutput = {
    stdout: { on: (_event, listener) => out.push(listener) },
    stderr: { on: (_event, listener) => err.push(listener) },
    on: (_event, listener) => close.push(listener),
  };
  return {
    command,
    stdout: (line: string) => out.forEach((l) => l(line)),
    stderr: (line: string) => err.forEach((l) => l(line)),
    close: (code: number | null) => close.forEach((l) => l({ code })),
  };
}

describe("watchSidecar", () => {
  it("is ready with the port from the port line, ignoring other output", async () => {
    const fake = fakeCommand();
    const watch = watchSidecar(fake.command);
    fake.stdout("starting");
    fake.stdout("SENSTO_PORT=51234\r\n");
    expect(await watch.startup).toEqual({ kind: "ready", port: 51234 });
  });

  it.each(["SENSTO_PORT=", "SENSTO_PORT=abc", "SENSTO_PORT=123456", "x SENSTO_PORT=80", "SENSTO_PORT=0"])(
    "does not take %j as the port line",
    async (line) => {
      const fake = fakeCommand();
      const watch = watchSidecar(fake.command);
      fake.stdout(line);
      fake.close(1);
      expect(await watch.startup).toEqual({ kind: "exited", message: "SenstoSales stopped unexpectedly." });
    },
  );

  it("reports the last plain stderr line when the sidecar exits before its port line", async () => {
    const fake = fakeCommand();
    const watch = watchSidecar(fake.command);
    fake.stderr("This data was saved by a newer version of SenstoSales. Install the newer version to open it.\n");
    fake.close(1);
    expect(await watch.startup).toEqual({
      kind: "exited",
      message: "This data was saved by a newer version of SenstoSales. Install the newer version to open it.",
    });
  });

  it("skips stack frames when choosing the message", async () => {
    const fake = fakeCommand();
    const watch = watchSidecar(fake.command);
    fake.stderr("Error: listen EACCES: permission denied 127.0.0.1");
    fake.stderr("    at Server.setupListenHandle (node:net:1881:21)");
    fake.stderr("");
    fake.close(1);
    expect(await watch.startup).toEqual({
      kind: "exited",
      message: "Error: listen EACCES: permission denied 127.0.0.1",
    });
  });

  it("reports an exit after it was ready through `exit`", async () => {
    const fake = fakeCommand();
    const watch = watchSidecar(fake.command);
    fake.stdout("SENSTO_PORT=51234");
    fake.stderr("database disk image is malformed");
    fake.close(1);
    expect(await watch.startup).toEqual({ kind: "ready", port: 51234 });
    expect(await watch.exit).toBe("database disk image is malformed");
  });
});
