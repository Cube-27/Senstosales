import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { blockTokens, colourTokens } from "../src/css-tokens.ts";

const css = readFileSync("apps/web/src/styles/globals.css", "utf8");

describe("globals.css token parity (INV-66)", () => {
  it("every :root colour token has a .dark value", () => {
    const dark = blockTokens(css, ".dark");
    expect([...colourTokens(css, ":root").keys()].filter((name) => !dark.has(name))).toEqual([]);
  });

  it("reads the tokens of one block; colour tokens are the colour literals", () => {
    const sample =
      ":root {\n  --a: #fff;\n  --b: rgba(0, 0, 0, 0.5);\n  --gap: 1rem;\n  --c: var(--a);\n}\n\n.dark {\n  --a: #000;\n}\n";
    expect(colourTokens(sample, ":root")).toEqual(
      new Map([
        ["--a", "#fff"],
        ["--b", "rgba(0, 0, 0, 0.5)"],
      ]),
    );
    expect(blockTokens(sample, ".dark")).toEqual(new Map([["--a", "#000"]]));
  });
});
