// Helpers for tests that run the orchestrator tools as Claude Code and the orchestrator run them: through bash, with
// stub programs on PATH.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ORCHESTRATOR = join(REPO, "tools", "orchestrator");

/** The absolute paths of NAME on PATH, in PATH order. */
function which(name: string): string[] {
  const finder = process.platform === "win32" ? "where" : "which";
  return (spawnSync(finder, [name], { encoding: "utf8" }).stdout ?? "").split(/\r?\n/).filter(Boolean);
}

/** The first PATH of NAME, or an error: a missing tool fails these tests rather than skipping them (CLAUDE.md §7). */
function required(name: string, path: string | undefined): string {
  if (path === undefined) throw new Error(`${name} is not on PATH (on Windows, Git Bash's usr/bin must be)`);
  return path;
}

/** The absolute path of bash: Git Bash on Windows, never WSL's. */
export const BASH = required(
  "bash",
  which("bash").find((path) => !/[\\/]System32[\\/]/i.test(path)),
);
const GIT = required("git", which("git")[0]);

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
export const REAL_NODE = `exec "${process.execPath.replaceAll("\\", "/")}" "$@"`;

export function run(
  command: string,
  args: string[],
  { input = "", ...options }: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string },
) {
  // Stdin is a file, not spawnSync's `input` pipe: a child that exits without reading stdin (the hook denying before
  // node runs) races that pipe write, and on Linux the lost race is an EPIPE thrown here.
  const dir = mkdtempSync(join(tmpdir(), "stdin-"));
  writeFileSync(join(dir, "stdin"), input);
  const stdin = openSync(join(dir, "stdin"), "r");
  const result = spawnSync(command, args, {
    ...options,
    stdio: [stdin, "pipe", "pipe"],
    encoding: "utf8",
    timeout: 120_000,
  });
  closeSync(stdin);
  rmSync(dir, { recursive: true });
  if (result.error) throw result.error;
  return result;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync(GIT, args, { cwd, encoding: "utf8" }).trim();
}
