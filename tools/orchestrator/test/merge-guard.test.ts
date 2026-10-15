// Behaviour of tools/orchestrator/src/merge-guard.ts, the PreToolUse hook that keeps agents from merging PRs directly,
// run as Claude Code runs it: hook JSON on stdin, exit 2 and a reason on stderr to deny.
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { ORCHESTRATOR, run } from "./shell.ts";

const GUARD = join(ORCHESTRATOR, "src", "merge-guard.ts");

const runGuard = (payload: string) => run(process.execPath, [GUARD], { input: payload });

const hookInput = (command: string, tool = "Bash"): string =>
  JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: { command } });

const DENIED = [
  "gh pr merge 100 --squash",
  "gh pr merge",
  "  gh   pr   merge 7",
  "gh.exe pr merge 7 --admin",
  "/usr/bin/gh pr merge 7",
  "gh pr --repo owner/repo merge 7",
  "gh pr -R owner/repo merge 7",
  "gh pr merge 7 --auto --squash",
  "cd backend && gh pr merge 7",
  "tools/orchestrator/wait_ci.sh 7 abc1234; gh pr merge 7",
  "tools/orchestrator/merge_pr.sh 7 abc1234 && gh pr merge 8",
  "echo $(gh pr merge 7)",
  "gh pr view 7 | cat\ngh pr merge 7",
  "GH_TOKEN=x gh pr merge 7",
  "bash -c 'gh pr merge 7'",
  'pwsh -Command "gh pr merge 7"',
  "bash -x -c 'gh pr merge 7'",
  "/bin/sh -c 'gh pr merge 7'",
  "sudo bash -c 'gh pr merge 7'",
  'pwsh -NoProfile -Command "gh pr merge 7"',
  "powershell.exe -command 'gh pr merge 7'",
  'cmd /c "gh pr merge 7"',
  "iex 'gh pr merge 7'",
  "cat <<EOF\n$(gh pr merge 7)\nEOF",
  "cat <<'EOF'\ntext\nEOF\ngh pr merge 7",
  'Write-Output @"\n$(gh pr merge 7)\n"@',
  'echo "merged: $(gh pr merge 7)"',
  'echo "merged: `gh pr merge 7`"',
  "gh pr \\\nmerge 7",
  "gh pr \\\r\nmerge 7",
  "gh \\\npr merge 7",
  "gh pr `\nmerge 7",
  "gh pr `\r\nmerge 7",
  "gh api -X PUT repos/owner/repo/pulls/7/merge",
  "gh api --method PUT /repos/owner/repo/pulls/7/merge -f merge_method=squash",
  "gh api repos/{owner}/{repo}/pulls/7/merge",
  "curl -X PUT https://api.example.com/repos/owner/repo/pulls/7/merge",
  "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
  "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
];

const ALLOWED = [
  "tools/orchestrator/merge_pr.sh 7 abc1234",
  "bash tools/orchestrator/merge_pr.sh 7 abc1234",
  "tools/orchestrator/wait_ci.sh 7 abc1234",
  "gh pr view 7 --json mergeable,mergeStateStatus",
  "gh pr list --state merged",
  "gh pr create --title 'fix(orchestrator): merge guard' --body x",
  "gh pr comment 7 --body 'READY abc1234, orchestrator: run gh pr merge after the tracker commit'",
  "git commit -m 'deny gh pr merge in agents'",
  "git merge origin/main",
  "grep -c 'gh pr merge' notes.md",
  'rg -c "gh pr merge" docs',
  "git -c core.pager=cat log --grep 'gh pr merge'",
  "gh api repos/owner/repo/pulls/7",
  "gh api repos/owner/repo/pulls/7/merges-report",
  "gh run list",
  "cat >> notes.md <<'EOF'\n| self-merge | `gh pr merge` is denied |\nEOF\ngit add notes.md",
  'git commit -F - <<"MSG"\nfix: deny gh pr merge 7\nMSG',
  "git commit -m @'\nfix: deny gh pr merge 7\n'@",
  "",
];

describe("merge guard", () => {
  it.each(DENIED)("denies a direct merge with a reason: %j", (command) => {
    const result = runGuard(hookInput(command));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("tools/orchestrator/merge_pr.sh");
  });

  it.each(ALLOWED)("lets other commands pass: %j", (command) => {
    expect(runGuard(hookInput(command))).toMatchObject({ status: 0, stderr: "" });
  });

  it("checks PowerShell tool commands too", () => {
    expect(runGuard(hookInput("gh pr merge 7", "PowerShell")).status).toBe(2);
  });

  it("falls back to a text match for a command with unbalanced quotes", () => {
    expect(runGuard(hookInput("gh pr merge 7 --body 'unterminated")).status).toBe(2);
    expect(runGuard(hookInput("echo 'unterminated")).status).toBe(0);
  });

  it("lets input without a command pass", () => {
    const payload = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } });

    expect(runGuard(payload).status).toBe(0);
  });

  it.each(["not json", "[1]"])("denies unreadable hook input: %j", (payload) => {
    const result = runGuard(payload);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("merge guard");
  });
});
