import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
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

  it("measures each shell file gzipped and sums them", () => {
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), INDEX);
    const bodies = { "index-abc.js": "a".repeat(5000), "react-def.js": "b".repeat(300), "index-ghi.css": "c{}" };
    for (const [name, body] of Object.entries(bodies)) writeFileSync(join(dist, "assets", name), body);
    writeFileSync(join(dist, "assets", "po-route.js"), "x".repeat(100_000));
    const gz = Object.values(bodies).map((body) => gzipSync(body).byteLength);
    expect(measureShell(dist)).toEqual({
      files: [
        { path: "assets/index-abc.js", gzip: gz[0] },
        { path: "assets/react-def.js", gzip: gz[1] },
        { path: "assets/index-ghi.css", gzip: gz[2] },
      ],
      total: (gz[0] ?? 0) + (gz[1] ?? 0) + (gz[2] ?? 0),
    });
  });

  it.each([
    ["passes a shell of 249 kB gzip", 249_000, 0],
    ["fails a shell of 251 kB gzip", 251_000, 1],
  ])("%s", (_, bytes, expected) => {
    const build = join(dist, String(bytes));
    mkdirSync(build);
    writeFileSync(join(build, "index.html"), '<script type="module" src="/main.js"></script>');
    // Random bytes do not compress: gzip adds a few bytes of framing, so the size sits just above `bytes`.
    writeFileSync(join(build, "main.js"), randomBytes(bytes - 1000));
    expect(main(build)).toBe(expected);
  });

  it("fails when there is no build", () => {
    expect(main(join(dist, "missing"))).toBe(1);
  });
});
