import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { checkWorkflow } from "../src/action-pins.ts";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const workflow = (...steps: string[]): string =>
  ["name: ci", "permissions:", "  contents: read", "jobs:", "  a:", "    steps:", ...steps].join("\n");

describe("checkWorkflow", () => {
  it.each([
    [`      - uses: actions/checkout@${SHA} # v7.0.1`],
    [`      - uses: "actions/checkout@${SHA}"`],
    [`      - uses: github/codeql-action/init@${SHA}`],
    ["      - uses: ./.github/actions/setup"],
    [`      - uses: docker://alpine@sha256:${"a".repeat(64)}`],
    [`    uses: octo/repo/.github/workflows/ci.yml@${SHA}`],
    [`      - { name: x, uses: "a/b@${SHA}" }`],
    ['      - run: "echo uses: a/b@v1"'],
  ])("accepts %s", (line) => {
    expect(checkWorkflow(workflow(line))).toEqual([]);
  });

  it.each([
    ["a tag", "      - uses: actions/checkout@v7"],
    ["a branch", "      - uses: actions/checkout@main"],
    ["a short SHA", `      - uses: actions/checkout@${SHA.slice(0, 7)}`],
    ["no ref", "      - uses: actions/checkout"],
    ["an uppercase SHA", `      - uses: actions/checkout@${SHA.toUpperCase()}`],
    ["a docker tag", "      - uses: docker://alpine:3.20"],
    ["a quoted tag", "      - uses: 'actions/checkout@v7'"],
    ["a flow-style step", "      - { uses: actions/checkout@v7 }"],
    ["a flow-style step after another key", "      - { name: x, uses: 'actions/checkout@v7' }"],
    ["a space before the colon", "      - uses : actions/checkout@v7"],
    ["a quoted key", '      - "uses": actions/checkout@v7'],
  ])("rejects %s with its line number", (_case, line) => {
    expect(checkWorkflow(workflow("      - run: true", line))).toEqual([{ line: 8, rule: "action-not-pinned" }]);
  });

  it("rejects a workflow without top-level permissions", () => {
    expect(checkWorkflow(`name: ci\njobs:\n  a:\n    permissions:\n      contents: read\n`)).toEqual([
      { line: 0, rule: "no-default-permissions" },
    ]);
  });

  it.each([
    ["write access", "permissions:\n  contents: write\n"],
    ["write-all", "permissions: write-all\n"],
    ["read-all", "permissions: read-all\n"],
    ["nothing (an empty block)", "permissions:\n"],
    ["write after a blank line", "permissions:\n  contents: read\n\n  pull-requests: write\n"],
    ["write after a comment line", "permissions:\n  contents: read\n# note\n  pull-requests: write\n"],
    ["write in an inline map", "permissions: { contents: read, pull-requests: write }\n"],
  ])("rejects top-level permissions granting %s", (_case, block) => {
    expect(checkWorkflow(`name: ci\n${block}jobs: {}\n`)).toEqual([{ line: 2, rule: "permissions-not-read" }]);
  });

  it.each([["{ contents: read }"], ["{}"]])("accepts the inline map permissions: %s", (map) => {
    expect(checkWorkflow(`permissions: ${map}\njobs: {}\n`)).toEqual([]);
  });

  it("rejects a workflow that is not valid YAML, at the error's line", () => {
    expect(checkWorkflow("permissions:\n  contents: read\njobs: [\n")).toEqual([{ line: 4, rule: "invalid-yaml" }]);
  });

  it("accepts read and none entries at the top level", () => {
    expect(checkWorkflow("permissions:\n  contents: read\n  id-token: none\njobs: {}\n")).toEqual([]);
  });

  it("accepts an indented comment and a blank line inside the block", () => {
    expect(checkWorkflow("permissions:\n  # read only\n\n  contents: read\njobs: {}\n")).toEqual([]);
  });
});

describe("action-pins CLI", () => {
  const run = (files: Record<string, string>): { status: number; stderr: string } => {
    const dir = mkdtempSync(join(tmpdir(), "pins-"));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "../src/action-pins.ts")], { cwd: dir });
    rmSync(dir, { recursive: true, force: true });
    return { status: result.status ?? -1, stderr: result.stderr.toString() };
  };

  it("passes when every workflow and action is pinned", () => {
    expect(run({ ".github/workflows/ci.yml": workflow(`      - uses: a/b@${SHA}`) }).status).toBe(0);
  });

  it("reports path:line and rule for an unpinned action in a composite action", () => {
    const action = "runs:\n  using: composite\n  steps:\n    - uses: a/b@v1\n";
    expect(run({ ".github/workflows/ci.yml": workflow(), ".github/actions/setup/action.yaml": action })).toEqual({
      status: 1,
      stderr: ".github/actions/setup/action.yaml:4 action-not-pinned\n",
    });
  });
});
