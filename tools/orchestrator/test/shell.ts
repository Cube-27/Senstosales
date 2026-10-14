// Helpers for tests that run the orchestrator tools as Claude Code and the orchestrator run them: through bash, with
// stub programs on PATH.
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ORCHESTRATOR = join(REPO, "tools", "orchestrator");

/** The absolute path of bash (Git Bash on Windows, never WSL's), or undefined when there is none. */
export const BASH: string | undefined = (() => {
  const finder = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(finder, ["bash"], { encoding: "utf8" }).stdout ?? "";
  return found.split(/\r?\n/).find((path) => path && !/[\\/]System32[\\/]/i.test(path));
})();

/** Writes each stub as an executable `#!/bin/bash` script into DIR/bin and returns that folder. */
export function stubBin(dir: string, stubs: Record<string, string>): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

/** A stub body that runs this Node, for a PATH that holds only stubs. */
export const realNode = (): string => `exec "${process.execPath.replaceAll("\\", "/")}" "$@"`;

export type Run = { status: number | null; stdout: string; stderr: string };

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string },
): Run {
  const result: SpawnSyncReturns<string> = spawnSync(command, args, { ...options, encoding: "utf8", timeout: 120_000 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
