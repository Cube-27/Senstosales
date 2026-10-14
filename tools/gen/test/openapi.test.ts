import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { OUTPUT, renderOpenApi } from "../src/openapi.ts";

describe("openapi.json (INV-101)", () => {
  it("the committed file is fresh (run `pnpm gen:openapi`)", () => {
    expect(readFileSync(OUTPUT, "utf8")).toBe(renderOpenApi());
  });
});
