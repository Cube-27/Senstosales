// Every orchestrator shell script parses (`bash -n`), so a syntax error fails `check` rather than a live merge.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { BASH, ORCHESTRATOR, run } from "./shell.ts";

const SCRIPTS = readdirSync(ORCHESTRATOR).filter((name) => name.endsWith(".sh"));

describe.skipIf(BASH === undefined)("orchestrator shell scripts", () => {
  it("are all found", () => {
    expect(SCRIPTS).toEqual([
      "cleanup_worktree.sh",
      "close_agent.sh",
      "config.sh",
      "merge_pr.sh",
      "start_agent.sh",
      "wait_ci.sh",
      "watch_agents.sh",
    ]);
  });

  it.each(SCRIPTS)("%s parses", (name) => {
    expect(run(BASH!, ["-n", join(ORCHESTRATOR, name)], {})).toMatchObject({ status: 0, stderr: "" });
  });
});
