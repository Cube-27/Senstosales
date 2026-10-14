// The merge-guard hook command in .claude/settings.json, run through bash as Claude Code runs it, with stub programs
// as the whole PATH: it must deny (exit 2) whenever the guard can't run, never fail open.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { BASH, REPO, realNode, run, stubBin } from "./shell.ts";

function hookCommand(): string {
  const settings = JSON.parse(readFileSync(join(REPO, ".claude", "settings.json"), "utf8"));
  return settings.hooks.PreToolUse[0].hooks[0].command as string;
}

function runHook(stubs: Record<string, string>, command: string) {
  const bin = stubBin(mkdtempSync(join(tmpdir(), "hook-")), stubs);
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  return run(BASH!, ["-c", hookCommand()], { input, env: { ...process.env, PATH: bin, CLAUDE_PROJECT_DIR: REPO } });
}

describe.skipIf(BASH === undefined)("merge-guard hook command", () => {
  it("allows a plain command", () => {
    expect(runHook({ node: realNode() }, "git status").status).toBe(0);
  });

  it("denies a direct merge", () => {
    expect(runHook({ node: realNode() }, "gh pr merge 7").status).toBe(2);
  });

  it.each([
    ["cannot start", "exit 9009"],
    ["fails with an error", 'echo "node: boom" >&2; exit 1'],
  ])("denies when node %s", (_case, stub) => {
    const result = runHook({ node: stub }, "git status");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("merge guard");
  });

  it("denies when no node is on PATH", () => {
    const result = runHook({}, "git status");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("merge guard");
  });
});
