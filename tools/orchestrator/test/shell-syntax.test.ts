// Every orchestrator shell script parses (`bash -n`), so a syntax error fails `check` rather than a live merge.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { BASH, ORCHESTRATOR, run } from "./shell.ts";

const SCRIPTS = readdirSync(ORCHESTRATOR).filter((name) => name.endsWith(".sh"));

describe.skipIf(BASH === undefined)("orchestrator shell scripts", () => {
  it("include merge_pr.sh, so the directory read found them", () => {
    expect(SCRIPTS).toContain("merge_pr.sh");
  });

  it.each(SCRIPTS)("%s parses", (name) => {
    expect(run(BASH!, ["-n", join(ORCHESTRATOR, name)], {})).toMatchObject({ status: 0, stderr: "" });
  });
});
