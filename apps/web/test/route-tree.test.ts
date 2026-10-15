import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Generator, getConfig } from "@tanstack/router-generator";
import { afterAll, describe, expect, it } from "vite-plus/test";

const web = fileURLToPath(new URL("..", import.meta.url));
const tsr = JSON.parse(readFileSync(join(web, "tsr.config.json"), "utf8")) as { generatedRouteTree: string };
const scratch = mkdtempSync(join(tmpdir(), "route-tree-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("routeTree.generated.ts", () => {
  it("the committed file is fresh (run `pnpm --filter @senstosales/web build`)", async () => {
    // The generator writes its output, so it runs on a copy of the routes with the same layout.
    cpSync(join(web, "src/routes"), join(scratch, "src/routes"), { recursive: true });
    const config = getConfig({ ...tsr, disableLogging: true, tmpDir: join(scratch, "tmp") }, scratch);
    await new Generator({ config, root: scratch }).run();
    expect(readFileSync(join(web, tsr.generatedRouteTree), "utf8")).toBe(
      readFileSync(join(scratch, tsr.generatedRouteTree), "utf8"),
    );
  });
});
