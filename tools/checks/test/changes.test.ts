import { describe, expect, it } from "vite-plus/test";

import { needsCode } from "../src/changes.ts";

describe("needsCode", () => {
  it.each<[string[], boolean]>([
    [["docs/specs/SPEC-14-web-shell-design-datatable.md"], false],
    [["README.md", "apps/web/README.md", "docs/adr/0004-globals-css-token-fixes.md"], false],
    [[".claude/skills/implement-pr/SKILL.md", "docs/plans/ACTIVE.md"], false],
    [["docs/diagrams/flow.svg"], false],
    [["docs/plans/ACTIVE.md", "apps/web/src/main.tsx"], true],
    [["packages/domain/src/qty.ts"], true],
    [["tools/checks/src/changes.ts"], true],
    [[".github/workflows/ci.yml"], true],
    [["pnpm-lock.yaml"], true],
    [["package.json"], true],
    [["apps/web/package.json"], true],
    [["vite.config.ts"], true],
    [[".claude/settings.json"], true],
    [["NOTICE"], true],
    [[], true],
  ])("%j -> %s", (paths, expected) => {
    expect(needsCode(paths)).toBe(expected);
  });
});
