import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { OUTPUT, renderRouteTree } from "../src/routes.ts";

describe("routeTree.generated.ts", () => {
  it("the committed file is fresh (run `pnpm gen:routes`)", async () => {
    expect(readFileSync(OUTPUT, "utf8")).toBe(await renderRouteTree());
  });
});
