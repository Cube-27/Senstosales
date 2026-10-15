// The guard hook commands in .claude/settings.json, run through bash as Claude Code runs them, with stub programs as
// the whole PATH: each must deny (exit 2) whenever its guard can't run, never fail open.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { BASH, REPO, REAL_NODE, run, stubBin } from "./shell.ts";

const settings = JSON.parse(readFileSync(join(REPO, ".claude", "settings.json"), "utf8"));
const HOOKS = settings.hooks.PreToolUse[0].hooks.map((hook: { command: string }) => hook.command) as string[];

// Each guard by its position in settings.json, with a command it denies.
const GUARDS: Array<[name: string, index: number, denied: string]> = [
  ["merge guard", 0, "gh pr merge 7"],
  ["path guard", 1, `git worktree add ${"/c"}/Projects/x`],
];

function runHook(hook: string, stubs: Record<string, string>, command: string) {
  const bin = stubBin(mkdtempSync(join(tmpdir(), "hook-")), stubs);
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  return run(BASH, ["-c", hook], { input, env: { ...process.env, PATH: bin, CLAUDE_PROJECT_DIR: REPO } });
}

describe.each(GUARDS)("%s hook command", (name, index, denied) => {
  const hook = HOOKS[index]!;

  it("names its guard", () => {
    expect(hook).toContain(name);
  });

  it("allows a plain command", () => {
    expect(runHook(hook, { node: REAL_NODE }, "git status").status).toBe(0);
  });

  it("denies a guarded command", () => {
    expect(runHook(hook, { node: REAL_NODE }, denied).status).toBe(2);
  });

  it.each([
    ["cannot start", "exit 9009"],
    ["fails with an error", 'echo "node: boom" >&2; exit 1'],
  ])("denies when node %s", (_case, stub) => {
    const result = runHook(hook, { node: stub }, "git status");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(name);
  });

  it("denies when no node is on PATH", () => {
    const result = runHook(hook, {}, "git status");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(name);
  });
});
