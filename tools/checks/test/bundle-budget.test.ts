import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { afterAll, describe, expect, it } from "vite-plus/test";

import { main, measureShell, shellAssets } from "../src/bundle-budget.ts";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/react-def.js">
    <link rel="stylesheet" crossorigin href="/assets/index-ghi.css">
    <link rel="icon" href="/favicon.svg">
  </head>
  <body><div id="root"></div></body>
</html>`;

const dist = mkdtempSync(join(tmpdir(), "bundle-budget-"));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe("bundle-budget (INV-104)", () => {
  it("the shell is the entry script, its preloads and stylesheets, not icons or route chunks", () => {
    expect(shellAssets(INDEX)).toEqual(["assets/index-abc.js", "assets/react-def.js", "assets/index-ghi.css"]);
  });

  it("never reads a path that leaves the dist root", () => {
    const html = `<script src="/assets/../../secret.js"></script><link rel="stylesheet" href="../x.css">`;
    expect(shellAssets(html)).toEqual([]);
  });

  it("measures each shell file gzipped and sums them", () => {
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), INDEX);
    const bodies = { "index-abc.js": "a".repeat(5000), "react-def.js": "b".repeat(300), "index-ghi.css": "c{}" };
    for (const [name, body] of Object.entries(bodies)) writeFileSync(join(dist, "assets", name), body);
    writeFileSync(join(dist, "assets", "po-route.js"), "x".repeat(100_000));
    expect(measureShell(dist)).toEqual({
      files: [
        { path: "assets/index-abc.js", gzip: 41 },
        { path: "assets/react-def.js", gzip: 25 },
        { path: "assets/index-ghi.css", gzip: 23 },
      ],
      total: 89,
    });
  });

  it.each([
    ["passes a shell under 250 kB gzip", 249_000, 0],
    ["fails a shell over 250 kB gzip", 250_000, 1],
  ])("%s", (_, bytes, expected) => {
    const build = join(dist, String(bytes));
    mkdirSync(build);
    writeFileSync(join(build, "index.html"), '<script type="module" src="/main.js"></script>');
    // Random bytes do not compress: gzip adds a few dozen bytes of framing, so the size sits just above `bytes`.
    writeFileSync(join(build, "main.js"), randomBytes(bytes));
    expect(main(build)).toBe(expected);
  });

  it("fails when there is no build", () => {
    expect(main(join(dist, "missing"))).toBe(1);
  });
});
