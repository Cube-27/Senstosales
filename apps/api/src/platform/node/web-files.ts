// The built SPA on disk (`apps/web/dist`). The sidecar build (`tools/release/src/build-sidecar.ts`, SPEC-20) replaces
// this module with one that serves the same files embedded in the bundle, so the sidecar needs no folder beside it.
import { fileURLToPath } from "node:url";

import type { WebFiles } from "./static.ts";
import { createFsStorage } from "./storage-fs.ts";

export const webFiles = (): WebFiles =>
  createFsStorage(fileURLToPath(new URL("../../../../web/dist", import.meta.url)));
