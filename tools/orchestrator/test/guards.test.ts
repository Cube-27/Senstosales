// Behaviour of the PreToolUse guards, run as Claude Code runs the hook (src/guards.ts): hook JSON on stdin, exit 2 and
// a reason on stderr to deny. merge-guard.ts keeps agents from merging PRs directly; path-guard.ts denies MSYS drive
// paths, which native Windows programs misread in a shell with path conversion off.
import { describe, expect, it } from "vite-plus/test";

import { hookInput, runGuards } from "./shell.ts";

const MERGE_DENIED = [
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

const MERGE_ALLOWED = [
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

const PATH_DENIED = [
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
  "cd x&&/c/Projects/y",
  "true;/c/x",
  "(/c/bin/tool)",
  "echo `/c/x`",
  "ls x|/c/bin/tool",
];

const PATH_ALLOWED = [
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

describe.each([
  { guard: "merge guard", denied: MERGE_DENIED, allowed: MERGE_ALLOWED, reason: "tools/orchestrator/merge_pr.sh" },
  { guard: "path guard", denied: PATH_DENIED, allowed: PATH_ALLOWED, reason: "write C:/Projects/... instead" },
])("$guard", ({ denied, allowed, reason }) => {
  it.each(denied)("denies with a reason: %j", (command) => {
    const result = runGuards(hookInput(command));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(reason);
  });

  it.each(allowed)("lets other commands pass: %j", (command) => {
    expect(runGuards(hookInput(command))).toMatchObject({ status: 0, stderr: "" });
  });

  it("checks PowerShell tool commands too", () => {
    expect(runGuards(hookInput(denied[0]!, "PowerShell")).status).toBe(2);
  });
});

describe("guards", () => {
  it("fall back to a text match for a command with unbalanced quotes", () => {
    expect(runGuards(hookInput("gh pr merge 7 --body 'unterminated")).status).toBe(2);
    expect(runGuards(hookInput("echo 'unterminated")).status).toBe(0);
  });

  it("let input without a command pass", () => {
    const payload = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } });

    expect(runGuards(payload).status).toBe(0);
  });

  it.each(["not json", "[1]"])("deny unreadable hook input: %j", (payload) => {
    const result = runGuards(payload);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("guard: unreadable hook input");
  });
});
