// `pnpm verify` runs everything CI runs: each CI job runs one root `check:*` script (as `pnpm check:x` or as that
// script's exact command), and `verify` chains every one of them in CI's job order.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parse } from "yaml";

import { REPO } from "./shell.ts";

type Workflow = { jobs: Record<string, { steps: Array<{ run?: string }> }> };

/** Job name -> its `run:` commands, in ci.yml order. */
function ciJobs(): Array<[string, string[]]> {
  const workflow = parse(readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8")) as Workflow;
  return Object.entries(workflow.jobs).map(([job, { steps }]) => [
    job,
    steps.flatMap((step) => (step.run === undefined ? [] : [step.run.trim()])),
  ]);
}

const scripts = (): Record<string, string> =>
  (JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

function checkScriptsOf(commands: string[]): string[] {
  const byCommand = new Map(
    Object.entries(scripts()).flatMap(([name, command]) => (name.startsWith("check:") ? [[command, name]] : [])),
  );
  const named = commands.flatMap((command) => /^pnpm (check:[\w-]+)$/.exec(command)?.[1] ?? []);
  return [...named, ...commands.flatMap((command) => byCommand.get(command) ?? [])];
}

describe("CI parity", () => {
  it("runs exactly one check script in every CI job", () => {
    const counts = Object.fromEntries(ciJobs().map(([job, commands]) => [job, checkScriptsOf(commands).length]));

    expect(counts).toEqual({ check: 1, "real-data-scan": 1, licenses: 1, build: 1, audit: 1 });
  });

  it("chains every CI check script in job order in verify", () => {
    const inCi = ciJobs().map(([, commands]) => checkScriptsOf(commands)[0]);

    expect(scripts()["verify"]).toBe(inCi.map((name) => `pnpm ${name}`).join(" && "));
  });
});
