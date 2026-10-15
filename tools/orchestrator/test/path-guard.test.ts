// Behaviour of tools/orchestrator/src/path-guard.ts, the PreToolUse hook that denies MSYS drive paths, run as Claude
// Code runs it: hook JSON on stdin, exit 2 and a reason on stderr to deny.
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { ORCHESTRATOR, run } from "./shell.ts";

const GUARD = join(ORCHESTRATOR, "src", "path-guard.ts");

const runGuard = (payload: string) => run(process.execPath, [GUARD], { input: payload });

const hookInput = (command: string, tool = "Bash"): string =>
  JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: { command } });

const DENIED = [
  // The command that created a stray worktree under C:/c/Projects.
  "git worktree add -q -b x /c/Projects/SenstoSales-worktrees/spec-12-pr-5 origin/main",
  "/c/Program\\ Files/nodejs/node.exe --version",
  "cd /c/Projects/app && pnpm install",
  "node /d/tools/run.js",
  "ls\t/C/Users",
  "git -C '/c/Projects/app' status",
  'vp test "/c/Projects/app/test"',
  "WORKTREE_ROOT=/c/Projects/app-worktrees tools/orchestrator/new_worktree.sh a b",
  "git --git-dir=/c/Projects/app/.git log",
  "PATH=/usr/bin:/c/tools/bin node x.js",
  "git worktree add C:/c/Projects/app-worktrees/x",
];

const ALLOWED = [
  "git worktree add -q -b x C:/Projects/SenstoSales-worktrees/spec-12-pr-5 origin/main",
  "cd C:/Projects/app && pnpm install",
  "git -C 'C:\\Projects\\app' status",
  "curl https://example.com/c/d",
  "gh api repos/owner/repo/pulls/7",
  "sed -e 's/c/d/' notes.md",
  "sed s/a/b/g notes.md",
  "ls src/c/x",
  "ls ./c/x ../d/y",
  "cat /usr/bin/x /etc/hosts",
  "cmd /c dir",
  "grep -c x notes.md",
  "",
];

describe("path guard", () => {
  it.each(DENIED)("denies an MSYS drive path with a reason: %j", (command) => {
    const result = runGuard(hookInput(command));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("write C:/Projects/... instead");
  });

  it.each(ALLOWED)("lets other commands pass: %j", (command) => {
    expect(runGuard(hookInput(command))).toMatchObject({ status: 0, stderr: "" });
  });

  it("checks PowerShell tool commands too", () => {
    expect(runGuard(hookInput("git worktree add /c/Projects/x", "PowerShell")).status).toBe(2);
  });

  it("lets input without a command pass", () => {
    const payload = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "/c/Projects/x" } });

    expect(runGuard(payload).status).toBe(0);
  });

  it.each(["not json", "[1]"])("denies unreadable hook input: %j", (payload) => {
    const result = runGuard(payload);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("path guard");
  });
});
