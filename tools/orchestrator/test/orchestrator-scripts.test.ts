// Behaviour of the tools/orchestrator shell scripts, run through bash with stub `gh` and `herdr` on PATH.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { BASH, ORCHESTRATOR, git, run, stubBin } from "./shell.ts";

// Each case spawns bash and its stubs many times, which is slow on Windows.
const SLOW = { timeout: 120_000 };
const HEAD = "0123456789abcdef0123456789abcdef01234567";

const tempDir = (): string => mkdtempSync(join(tmpdir(), "orch-"));
const posix = (path: string): string => path.replaceAll("\\", "/");
const read = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8").trim() : "");

/** DIR/repo, a throwaway git repository, created on first use. */
function initRepo(dir: string): string {
  const repo = join(dir, "repo");
  if (!existsSync(repo)) {
    mkdirSync(repo);
    git(repo, "init", "-q");
  }
  return repo;
}

/** Runs SCRIPT with STUBS first on PATH, from CWD (default: a throwaway repo): the scripts read `git worktree list`,
 * and watch_agents.sh keeps its pidfile in the git common dir, which must not be the real repo's. */
function runScript(dir: string, script: string, args: string[], stubs: Record<string, string>, env = {}, cwd?: string) {
  const PATH = `${stubBin(dir, stubs)}${delimiter}${process.env["PATH"]}`;
  const options = { cwd: cwd ?? initRepo(dir), env: { ...process.env, ...env, PATH } };
  return run(BASH, [join(ORCHESTRATOR, script), ...args], options);
}

// `gh pr view` as wait_ci.sh asks for it: the head line, then one line per check run.
const ghChecks = (...checks: string[]): string =>
  `printf "%s\\n" ${[`${HEAD} MERGEABLE CLEAN`, ...checks].map((line) => `"${line}"`).join(" ")}`;
const GH_GREEN = ghChecks("check COMPLETED SUCCESS");

describe("wait_ci.sh", SLOW, () => {
  it.each([HEAD.slice(0, 7), HEAD.slice(0, 12), HEAD])("accepts the head by any prefix length: %s", (sha) => {
    const result = runScript(tempDir(), "wait_ci.sh", ["1", sha, "1"], { gh: GH_GREEN }, { WAIT_CI_POLL_S: "1" });

    expect([result.status, result.stdout]).toEqual([0, "check COMPLETED SUCCESS\n"]);
  });

  it.each([
    [["check COMPLETED SKIPPED"], {}, 1],
    [["check COMPLETED NEUTRAL"], {}, 1],
    [["check COMPLETED SUCCESS", "advisory COMPLETED NEUTRAL", "docs COMPLETED SKIPPED"], {}, 0],
    [["check COMPLETED SUCCESS", "Quality Gate COMPLETED SKIPPED"], { CI_GATE_CHECK: "Quality Gate" }, 1],
    [["check COMPLETED SUCCESS", "Quality Gate COMPLETED SUCCESS"], { CI_GATE_CHECK: "Quality Gate" }, 0],
  ])("requires the first job and the gate to succeed: %j %j", (checks, env, code) => {
    const stubs = { gh: ghChecks(...checks) };
    const result = runScript(tempDir(), "wait_ci.sh", ["1", HEAD.slice(0, 7), "1"], stubs, {
      WAIT_CI_POLL_S: "1",
      ...env,
    });

    expect(result.status).toBe(code);
  });

  it("rejects a sha too short to identify a commit", () => {
    const result = runScript(tempDir(), "wait_ci.sh", ["1", "0123"], { gh: GH_GREEN }, { WAIT_CI_POLL_S: "1" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ERROR");
  });
});

type MergeCase = {
  branch?: string;
  files?: string[];
  merged?: boolean;
  stateFails?: boolean;
  sha?: string;
  mergeExit?: number;
  after?: string;
};

/** A `gh` stub for merge_pr.sh: CI green on HEAD, the PR's changed files, `pr merge` exiting MERGEEXIT (calls counted
 * in gh-merges), and the PR state "<state> <head> <branch>": MERGED at HEAD when MERGED, else OPEN until a merge call,
 * then AFTER. */
function ghForMerge(dir: string, c: MergeCase): string {
  const files = c.files ?? ["docs/plans/ACTIVE.md", "src/a.ts"];
  const merges = posix(join(dir, "gh-merges"));
  const branch = c.branch ?? "spec-01/pr-1-x";
  const before = `${c.merged ? "MERGED" : "OPEN"} ${HEAD} ${branch}`;
  return [
    'case "$*" in',
    `  *statusCheckRollup*) ${GH_GREEN} ;;`,
    `  "pr diff"*) printf "%s\\n" ${files.map((f) => `"${f}"`).join(" ")} ;;`,
    `  "pr merge"*) echo merge >> "${merges}"; echo "GraphQL: Something went wrong" >&2; exit ${c.mergeExit ?? 0} ;;`,
    `  *state,headRefOid,headRefName*) ${c.stateFails ? "exit 1;" : ""} [[ -e "${merges}" ]] && echo "${c.after ?? `MERGED ${HEAD}`} ${branch}" || echo "${before}" ;;`,
    `  *headRefOid*) echo "${HEAD}" ;;`,
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
}

function mergePr(c: MergeCase) {
  const dir = tempDir();
  const env = { WAIT_CI_POLL_S: "1", MERGE_CONFIRM_S: "0" };
  const result = runScript(dir, "merge_pr.sh", ["7", c.sha ?? HEAD.slice(0, 7)], { gh: ghForMerge(dir, c) }, env);
  return { ...result, merges: read(join(dir, "gh-merges")).split("\n").filter(Boolean).length };
}

describe("merge_pr.sh", SLOW, () => {
  it("merges a green spec PR that carries its tracker commit", () => {
    expect(mergePr({})).toMatchObject({ status: 0, merges: 1 });
  });

  it("succeeds without retrying when gh reports an error but the PR merged at the head", () => {
    const result = mergePr({ mergeExit: 1 });

    expect(result).toMatchObject({ status: 0, merges: 1 });
    expect(result.stdout).toContain(`merged despite the gh error: PR #7 at ${HEAD}`);
  });

  it.each([`OPEN ${HEAD}`, `MERGED ${"f".repeat(40)}`])("fails when the merge failed: PR state %s", (after) => {
    const result = mergePr({ mergeExit: 1, after });

    expect(result).toMatchObject({ status: 1, merges: 1 });
    expect(result.stderr).toContain("ERROR merge of PR #7 failed");
  });

  it("exits 0 without merging again when the PR is already merged at the head", () => {
    const result = mergePr({ merged: true });

    expect(result).toMatchObject({ status: 0, merges: 0 });
    expect(result.stdout).toBe(`already merged: PR #7 at ${HEAD}
`);
  });

  it("refuses a spec PR whose diff does not touch the tracker", () => {
    const result = mergePr({ files: ["src/a.ts"] });

    expect(result).toMatchObject({ status: 1, merges: 0 });
    expect(result.stderr).toBe(
      "ERROR PR #7 (spec-01/pr-1-x) does not touch docs/plans/ACTIVE.md: the tracker commit is missing." +
        " Send YOUR TURN and wait for READY before merging.\n",
    );
  });

  it.each(["", "0123"])("rejects a SHA7 that cannot identify a commit, even on a merged PR: %j", (sha) => {
    const result = mergePr({ merged: true, sha });

    expect(result).toMatchObject({ status: 1, merges: 0, stdout: "" });
    expect(result.stderr).toContain("usage: merge_pr.sh PR SHA7");
  });

  it("refuses to merge when the PR state cannot be read", () => {
    const result = mergePr({ stateFails: true });

    expect(result).toMatchObject({ status: 1, merges: 0 });
    expect(result.stderr).toBe("ERROR cannot read the state of PR #7\n");
  });

  it("merges a non-spec PR without a tracker change", () => {
    expect(mergePr({ branch: "chore/ts-tooling", files: ["src/a.ts"] })).toMatchObject({ status: 0, merges: 1 });
  });
});

/** A `herdr` stub that prints the next response on each call and repeats the last; `FAIL` exits 1. */
function herdrSequence(dir: string, responses: string[]): string {
  responses.forEach((response, index) => writeFileSync(join(dir, `herdr-${index}`), response));
  const counter = posix(join(dir, "herdr-calls"));
  const last = responses.length - 1;
  return (
    `n=$(cat "${counter}" 2>/dev/null || echo 0); echo $((n + 1)) > "${counter}"; (( n > ${last} )) && n=${last}\n` +
    `f="${posix(dir)}/herdr-$n"; [[ $(cat "$f") == FAIL ]] && exit 1; cat "$f"`
  );
}

/** `herdr agent list` output for [name, status, workspace] entries. */
const agents = (...entries: Array<[string, string, string]>): string =>
  JSON.stringify({
    result: {
      agents: entries.map(([name, status, workspace]) => ({
        name,
        agent_status: status,
        workspace_id: workspace,
      })),
    },
  });

const AGENT_A = agents(["impl-a", "working", "w1"]);
const NO_AGENTS = agents();
const WATCH_ENV = { INTERVAL: "0", MIN_FREE_MB: "0", HERDR_WORKSPACE_ID: "w1" };

describe("watch_agents.sh", SLOW, () => {
  it("ignores agents of other workspaces", () => {
    const dir = tempDir();
    const other: [string, string, string] = ["uat-tester2", "idle", "w14"];
    const herdr = herdrSequence(dir, [agents(["impl-a", "working", "w1"], other), agents(other)]);
    const result = runScript(dir, "watch_agents.sh", [], { herdr, gh: "exit 0" }, WATCH_ENV);

    // An idle agent of another workspace would have exited first with SETTLED uat-tester2 idle.
    expect([result.status, result.stdout]).toEqual([0, "GONE impl-a\n"]);
  });

  it("reports the last agent gone", () => {
    const dir = tempDir();
    const herdr = herdrSequence(dir, [AGENT_A, NO_AGENTS]);
    const result = runScript(dir, "watch_agents.sh", [], { herdr, gh: "exit 0" }, WATCH_ENV);

    expect([result.status, result.stdout]).toEqual([0, "GONE impl-a\n"]);
  });

  it("treats a failed herdr poll as no news", () => {
    const dir = tempDir();
    const herdr = herdrSequence(dir, [AGENT_A, "FAIL", "FAIL", "FAIL", NO_AGENTS]);
    const result = runScript(dir, "watch_agents.sh", [], { herdr, gh: "exit 0" }, WATCH_ENV);

    // Only the real empty list after the failed polls reports GONE; the failures alone would not.
    expect([result.status, result.stdout]).toEqual([0, "GONE impl-a\n"]);
    expect(read(join(dir, "herdr-calls"))).toBe("5");
  });
});

/** An origin, its clone `app`, and worktree app-worktrees/spec-01-pr-1 on branch `spec-01/pr-1-x`, merged. */
function mergedWorktree(dir: string): { main: string; origin: string } {
  const origin = join(dir, "origin.git");
  const main = join(dir, "app");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "clone", "-q", origin, main);
  for (const [key, value] of [
    ["user.email", "t@example.test"],
    ["user.name", "t"],
    ["commit.gpgsign", "false"],
  ]) {
    git(main, "config", key!, value!);
  }
  git(main, "commit", "-q", "--allow-empty", "-m", "init");
  git(main, "push", "-q", "-u", "origin", "main");
  const worktree = join(dir, "app-worktrees", "spec-01-pr-1");
  git(main, "worktree", "add", "-q", "-b", "spec-01/pr-1-x", worktree);
  git(worktree, "commit", "-q", "--allow-empty", "-m", "work");
  git(worktree, "push", "-q", "origin", "spec-01/pr-1-x");
  git(main, "merge", "-q", "--ff-only", "spec-01/pr-1-x");
  git(main, "push", "-q", "origin", "main");
  return { main, origin };
}

const runCleanup = (dir: string, main: string, docker = "exit 0", worktree = "spec-01-pr-1") =>
  runScript(
    dir,
    "cleanup_worktree.sh",
    [worktree, "spec-01/pr-1-x"],
    { gh: "exit 0", docker },
    { CLEANUP_RETRY_S: "0" },
    main,
  );

const branches = (main: string, origin: string): string[] => [
  git(main, "branch", "--list", "spec-01/pr-1-x"),
  git(origin, "branch", "--list", "spec-01/pr-1-x"),
];

describe("cleanup_worktree.sh", SLOW, () => {
  it("removes a merged worktree and its branches", () => {
    const dir = tempDir();
    const { main, origin } = mergedWorktree(dir);
    const result = runCleanup(dir, main);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(dir, "app-worktrees", "spec-01-pr-1"))).toBe(false);
    expect(branches(main, origin)).toEqual(["", ""]);
  });

  it("keeps the branches when the worktree cannot be removed", () => {
    const dir = tempDir();
    const { main, origin } = mergedWorktree(dir);
    git(main, "worktree", "lock", join(dir, "app-worktrees", "spec-01-pr-1")); // --force alone can't remove it
    const result = runCleanup(dir, main);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not remove the worktree spec-01-pr-1");
    expect(branches(main, origin)).toEqual(["+ spec-01/pr-1-x", "spec-01/pr-1-x"]);
  });

  it.each(["/", "\\"])("refuses a worktree path and removes nothing: separator %s", (separator) => {
    const dir = tempDir();
    const { main, origin } = mergedWorktree(dir);
    const result = runCleanup(dir, main, "exit 0", ["..", "app-worktrees", "spec-01-pr-1"].join(separator));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("not a path");
    expect(existsSync(join(dir, "app-worktrees", "spec-01-pr-1"))).toBe(true);
    expect(branches(main, origin)).toEqual(["+ spec-01/pr-1-x", "spec-01/pr-1-x"]);
  });

  it.each(["spec-02-pr-1", ".", ".."])("refuses a directory that is not a registered worktree: %s", (worktree) => {
    const dir = tempDir();
    const { main, origin } = mergedWorktree(dir);
    mkdirSync(join(dir, "app-worktrees", "spec-02-pr-1"));
    const result = runCleanup(dir, main, "exit 0", worktree);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is not a registered worktree");
    expect(existsSync(join(dir, "app-worktrees", "spec-02-pr-1"))).toBe(true);
    expect(branches(main, origin)).toEqual(["+ spec-01/pr-1-x", "spec-01/pr-1-x"]);
  });

  it("refuses a name that is not the worktree of the branch", () => {
    const dir = tempDir();
    const { main, origin } = mergedWorktree(dir);
    const result = runCleanup(dir, main, "exit 0", "spec-01-pr1"); // a typo: no such directory

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is checked out in");
    expect(existsSync(join(dir, "app-worktrees", "spec-01-pr-1"))).toBe(true);
    expect(branches(main, origin)).toEqual(["+ spec-01/pr-1-x", "spec-01/pr-1-x"]);
  });

  it("refuses another branch's worktree after its own is gone", () => {
    const dir = tempDir();
    const { main, origin } = mergedWorktree(dir);
    git(main, "worktree", "remove", join(dir, "app-worktrees", "spec-01-pr-1"));
    const other = join(dir, "app-worktrees", "spec-02-pr-1");
    git(main, "worktree", "add", "-q", "-b", "spec-02/pr-1-y", other);
    const result = runCleanup(dir, main, "exit 0", "spec-02-pr-1");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is not the worktree of");
    expect(existsSync(other)).toBe(true);
    expect(branches(main, origin)).toEqual(["spec-01/pr-1-x", "spec-01/pr-1-x"]);
  });

  it("warns when docker cannot list containers", () => {
    const dir = tempDir();
    const { main } = mergedWorktree(dir);
    const result = runCleanup(dir, main, "exit 1");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("warning: docker ps failed");
  });
});

/** A `herdr` stub: `agent list` prints LISTING, `agent get` prints AGENT (or fails), `tab create` fails, and
 * `pane close` is recorded in herdr-closed. */
function herdrDispatch(dir: string, listing: string, agent?: Record<string, string>): string {
  writeFileSync(join(dir, "herdr-list"), listing);
  writeFileSync(join(dir, "herdr-get"), agent ? JSON.stringify({ result: { agent } }) : "");
  const base = posix(dir);
  return [
    'case "$1 $2" in',
    `  "agent list") cat "${base}/herdr-list" ;;`,
    `  "agent get") [[ -s "${base}/herdr-get" ]] || exit 1; cat "${base}/herdr-get" ;;`,
    `  "pane close") echo "$3" >> "${base}/herdr-closed" ;;`,
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
}

function startAgent(dir: string, listing: string, env: Record<string, string> = {}) {
  mkdirSync(join(dir, "worktrees", "spec-09-pr-1"), { recursive: true });
  const fullEnv = { HERDR_WORKSPACE_ID: "w1", MAX_WORKERS: "2", WORKTREE_ROOT: join(dir, "worktrees"), ...env };
  const stubs = { herdr: herdrDispatch(dir, listing) };
  return runScript(dir, "start_agent.sh", ["impl-x", "spec-09-pr-1", "go", "0"], stubs, fullEnv);
}

describe("start_agent.sh", SLOW, () => {
  it("counts workers of its own workspace only", () => {
    const others = [0, 1, 2].map((n): [string, string, string] => [`impl-${n}`, "working", "w14"]);
    const result = startAgent(
      tempDir(),
      agents(["reviewer-pr1", "working", "w1"], ["impl-a", "working", "w1"], ...others),
    );

    // Past the limit check (1 worker of 2 in w1), it stops at the stubbed tab create.
    expect(result.stderr.endsWith("ERROR tab create failed\n")).toBe(true);
  });

  it("refuses past the worker limit", () => {
    const result = startAgent(tempDir(), agents(["impl-a", "working", "w1"], ["impl-b", "idle", "w1"]));

    expect(result.stderr).toBe("ERROR worker limit: 2 alive in workspace w1, max 2\n");
  });

  it("waits for another start, then gives up", () => {
    const dir = tempDir();
    mkdirSync(join(initRepo(dir), ".git", "start_agent.lock"));
    const result = startAgent(dir, agents(), { START_AGENT_LOCK_WAIT_S: "1" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("another start_agent.sh holds");
  });
});

describe("close_agent.sh", SLOW, () => {
  it.each([
    ["w1", "closed impl-a w1:p1\n", "w1:p1"],
    ["w14", "gone impl-a\n", ""],
  ])("closes only agents of its own workspace: %s", (workspace, stdout, closed) => {
    const dir = tempDir();
    const agent = { name: "impl-a", pane_id: `${workspace}:p1`, workspace_id: workspace, agent_status: "idle" };
    const herdr = herdrDispatch(dir, agents(), agent);
    const result = runScript(dir, "close_agent.sh", ["impl-a"], { herdr }, { HERDR_WORKSPACE_ID: "w1" });

    expect([result.status, result.stdout]).toEqual([0, stdout]);
    expect(read(join(dir, "herdr-closed"))).toBe(closed);
  });
});
