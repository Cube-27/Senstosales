import { describe, expect, it } from "vite-plus/test";

import { deniedPackages, isClean } from "../src/license-check.ts";

describe("isClean", () => {
  it.each([
    ["MIT", true],
    ["Apache-2.0", true],
    ["LGPL-2.1-only", true],
    ["(MIT OR Apache-2.0)", true],
    ["MIT OR GPL-3.0-only", true],
    ["GPL-3.0-only", false],
    ["gpl-3.0-only", false],
    ["AGPL-3.0-or-later", false],
    ["MIT AND GPL-3.0-only", false],
    ["GPL-3.0-only AND (MIT OR Apache-2.0)", false],
    ["(MIT OR Apache-2.0) AND GPL-3.0-only", false],
    ["(GPL-3.0-only AND MIT) OR Apache-2.0", true],
    ["GPL-2.0+", false],
    ["AGPL-3.0+", false],
    ["GPL-2.0-only WITH Classpath-exception-2.0", false],
    ["Apache-2.0 WITH LLVM-exception", true],
    ["SSPL-1.0", false],
    ["Unknown", false],
    ["", false],
    ["(MIT OR", false],
    ["MIT Apache-2.0", false],
  ])("%s -> clean %s", (expression, clean) => {
    expect(isClean(expression)).toBe(clean);
  });
});

describe("deniedPackages", () => {
  it("names each package under a denied licence with its versions", () => {
    expect(
      deniedPackages({
        MIT: [{ name: "ok", versions: ["1.0.0"] }],
        "GPL-3.0-only": [{ name: "bad", versions: ["2.0.0", "2.1.0"] }],
        Unknown: [{ name: "mystery" }],
      }),
    ).toEqual(["bad@2.0.0,2.1.0: GPL-3.0-only", "mystery@: Unknown"]);
  });
});
