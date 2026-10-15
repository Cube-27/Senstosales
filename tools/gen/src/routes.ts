// Writes the web app's route tree to apps/web/src/routeTree.generated.ts with the TanStack router generator and
// `apps/web/tsr.config.json` (SPEC-14 §4.1). `vp build` regenerates it too; a test fails when the committed file is
// stale. The generator writes its output, so it runs on a copy of the routes and the config.
// Usage: node tools/gen/src/routes.ts (from the repo root), or `pnpm gen:routes`.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Generator, getConfig } from "@tanstack/router-generator";

const WEB = "apps/web";
const TREE = "src/routeTree.generated.ts";
export const OUTPUT = `${WEB}/${TREE}`;

export async function renderRouteTree(): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), "route-tree-"));
  try {
    cpSync(join(WEB, "src/routes"), join(scratch, "src/routes"), { recursive: true });
    cpSync(join(WEB, "tsr.config.json"), join(scratch, "tsr.config.json"));
    const config = getConfig({ disableLogging: true, tmpDir: join(scratch, "tmp") }, scratch);
    await new Generator({ config, root: scratch }).run();
    return readFileSync(join(scratch, TREE), "utf8");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) writeFileSync(OUTPUT, await renderRouteTree());
