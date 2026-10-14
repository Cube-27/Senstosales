// `pnpm verify` runs everything CI runs: each CI job runs one root `check:*` script (as `pnpm check:x` or as that
// script's exact command), and `verify` chains every one of them in CI's job order.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { REPO } from "./shell.ts";

/** Job name -> its `run:` commands, from the two-space-indented keys under `jobs:` in ci.yml. */
function ciJobs(): Map<string, string[]> {
  const text = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8").replaceAll("\r\n", "\n");
  const jobs = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of text.split("\njobs:\n", 2)[1]!.split("\n")) {
    const job = /^ {2}([\w-]+):$/.exec(line);
    const run = /^\s+- run: (.+)$/.exec(line);
    if (job) jobs.set(job[1]!, (current = []));
    else if (current && run) current.push(run[1]!.trim());
  }
  return jobs;
}

const scripts = (): Record<string, string> =>
  JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).scripts as Record<string, string>;

function checkScriptsOf(commands: string[]): string[] {
  const byCommand = new Map(
    Object.entries(scripts()).flatMap(([name, command]) => (name.startsWith("check:") ? [[command, name]] : [])),
  );
  const named = commands.flatMap((command) => /^pnpm (check:[\w-]+)$/.exec(command)?.[1] ?? []);
  return [...named, ...commands.flatMap((command) => byCommand.get(command) ?? [])];
}

describe("CI parity", () => {
  it("runs exactly one check script in every CI job", () => {
    const counts = Object.fromEntries([...ciJobs()].map(([job, commands]) => [job, checkScriptsOf(commands).length]));

    expect(counts).toEqual({ check: 1, "real-data-scan": 1, licenses: 1, build: 1, audit: 1 });
  });

  it("chains every CI check script in job order in verify", () => {
    const inCi = [...ciJobs().values()].map((commands) => checkScriptsOf(commands)[0]);

    expect(scripts()["verify"]).toBe(inCi.map((name) => `pnpm ${name}`).join(" && "));
  });
});
