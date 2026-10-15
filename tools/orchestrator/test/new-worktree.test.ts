// Behaviour of tools/orchestrator/new_worktree.sh, run through bash from throwaway repositories.
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import { BASH, ORCHESTRATOR, git, run } from "./shell.ts";

const SLOW = { timeout: 120_000 };
const posix = (path: string): string => path.replaceAll("\\", "/");

/** In a new temp dir: an origin and a repository `app` tracking it, with one commit on origin's main that `app`
 * has not fetched. */
function cloneBehindOrigin(): { dir: string; main: string; tip: string } {
  const dir = mkdtempSync(join(tmpdir(), "wt-"));
  const origin = join(dir, "origin.git");
  const main = join(dir, "app");
  const other = join(dir, "other");
  const identity = ["-c", "user.email=t@example.test", "-c", "user.name=t", "-c", "commit.gpgsign=false"];
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "init", "-q", "-b", "main", main);
  git(main, ...identity, "commit", "-q", "--allow-empty", "-m", "init");
  git(main, "remote", "add", "origin", origin);
  git(main, "push", "-q", "-u", "origin", "main");
  git(dir, "clone", "-q", origin, other);
  git(other, ...identity, "commit", "-q", "--allow-empty", "-m", "newer");
  git(other, "push", "-q", "origin", "HEAD:main");
  return { dir, main, tip: git(other, "rev-parse", "HEAD") };
}

function newWorktree(main: string, args: string[], env: Record<string, string> = {}) {
  return run(BASH, [join(ORCHESTRATOR, "new_worktree.sh"), ...args], { cwd: main, env: { ...process.env, ...env } });
}

describe("new_worktree.sh", SLOW, () => {
  // The refusals exit before fetching or creating anything, so they share one plain repository.
  let repo = "";
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "wt-"));
    git(repo, "init", "-q");
  });

  it("creates the worktree off fresh origin/main beside the repo and prints its path", () => {
    const { dir, main, tip } = cloneBehindOrigin();
    const result = newWorktree(main, ["spec-01-pr-1", "spec-01/pr-1-x"]);
    const worktree = join(dir, "app-worktrees", "spec-01-pr-1");

    expect(result.status, result.stderr).toBe(0);
    expect(posix(result.stdout.trim()).toLowerCase()).toBe(posix(worktree).toLowerCase());
    expect(git(worktree, "rev-parse", "HEAD")).toBe(tip);
    expect(git(worktree, "branch", "--show-current")).toBe("spec-01/pr-1-x");
  });

  it.runIf(process.platform === "win32")("turns an MSYS drive-path WORKTREE_ROOT into a Windows path", () => {
    const { dir, main } = cloneBehindOrigin();
    const root = posix(join(dir, "roots")).replace(
      /^([A-Za-z]):/,
      (_match, drive: string) => `/${drive.toLowerCase()}`,
    );
    const result = newWorktree(main, ["spec-01-pr-1", "spec-01/pr-1-x"], { WORKTREE_ROOT: root });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[A-Za-z]:\//);
    expect(existsSync(join(dir, "roots", "spec-01-pr-1", ".git"))).toBe(true);
  });

  it.each(["C:/c/Projects/app-worktrees", "D:/d/app-worktrees", "C:\\c\\Projects\\app-worktrees"])(
    "refuses a WORKTREE_ROOT under a mangled drive path and creates nothing: %s",
    (root) => {
      const result = newWorktree(repo, ["spec-01-pr-1", "spec-01/pr-1-x"], { WORKTREE_ROOT: root });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("MSYS drive path");
      expect(git(repo, "branch", "--list", "spec-01/pr-1-x")).toBe("");
    },
  );

  it.each(["../spec-01-pr-1", "a\\b", ""])("refuses a name that is not a plain directory name: %j", (name) => {
    const result = newWorktree(repo, [name, "spec-01/pr-1-x"]);

    expect(result.status).toBe(2);
    expect(git(repo, "branch", "--list", "spec-01/pr-1-x")).toBe("");
  });
});
