// SPEC-20 PR 3, ADR 0001: who may call which plugin. The bundled shell page alone starts the sidecar; the app at the
// loopback origin gets only what platform/tauri.ts (SPEC-14) calls: file dialogs, notifications and the tray status.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

interface Capability {
  identifier: string;
  windows: string[];
  remote?: { urls: string[] };
  permissions: Array<string | { identifier: string }>;
}
interface ExecutePermission {
  identifier: "shell:allow-execute";
  allow: Array<{ args: Array<{ validator: string }> }>;
}

const DIR = join(import.meta.dirname, "../src-tauri/capabilities");
const capabilities = readdirSync(DIR).map((name) => JSON.parse(readFileSync(join(DIR, name), "utf8")) as Capability);
const byId = (id: string): Capability => {
  const found = capabilities.find((c) => c.identifier === id);
  if (!found) throw new Error(`no capability ${id}`);
  return found;
};
/** The pattern Explorer's one argument must match in the shell capability. */
function explorerValidator(): string {
  const execute = byId("shell").permissions.find(
    (p): p is ExecutePermission => typeof p !== "string" && p.identifier === "shell:allow-execute",
  );
  const validator = execute?.allow[0]?.args[0]?.validator;
  if (!validator) throw new Error("no Explorer validator");
  return validator;
}
const permissionIds = (c: Capability): string[] => c.permissions.map((p) => (typeof p === "string" ? p : p.identifier));

describe("capabilities", () => {
  it("are the shell page's and the app's, nothing else", () => {
    expect(capabilities.map((c) => c.identifier).toSorted()).toEqual(["app", "shell"]);
  });

  it("give the loopback app only dialogs, notifications and the tray status", () => {
    const app = byId("app");
    expect(app.windows).toEqual(["main"]);
    expect(app.remote).toEqual({ urls: ["http://127.0.0.1:*"] });
    expect(permissionIds(app)).toEqual([
      "dialog:allow-open",
      "dialog:allow-save",
      "notification:default",
      "core:tray:allow-get-by-id",
      "core:tray:allow-set-tooltip",
    ]);
  });

  it("keep the shell page local, with the sidecar as the only program it may start besides Explorer", () => {
    const shell = byId("shell");
    expect(shell.windows).toEqual(["shell"]);
    expect(shell.remote).toBeUndefined();
    expect(shell.permissions.filter((p) => typeof p !== "string")).toEqual([
      { identifier: "shell:allow-spawn", allow: [{ name: "binaries/sensto-sidecar", sidecar: true }] },
      {
        identifier: "shell:allow-execute",
        allow: [{ name: "explorer", cmd: "explorer", args: [{ validator: expect.any(String) }] }],
      },
    ]);
  });

  it("let Explorer open a SenstoSales log folder and nothing else", () => {
    // The plugin matches the whole argument with Rust's `regex`, which reads this pattern as JavaScript does.
    const validator = new RegExp(explorerValidator());
    const paths = [
      "D:\\app data\\SenstoSales\\logs",
      "D:\\app data\\SenstoSales",
      "C:\\Windows\\System32",
      '"C:\\x" /e,C:\\SenstoSales\\logs',
      "\\\\server\\share\\SenstoSales\\logs",
    ];
    expect(paths.map((path) => validator.test(path))).toEqual([true, false, false, false, false]);
  });
});
