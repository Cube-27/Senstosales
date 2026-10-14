// Writes the route table's OpenAPI document to packages/schemas/generated/openapi.json (SPEC-04 §4.1, INV-101). A
// test fails when the committed file is stale; the file is not formatted (vite.config.ts).
// Usage: node tools/gen/src/openapi.ts (from the repo root), or `pnpm gen:openapi`.
import { writeFileSync } from "node:fs";

import { routes } from "@senstosales/schemas";
import { buildOpenApi } from "@senstosales/schemas/openapi";

export const OUTPUT = "packages/schemas/generated/openapi.json";

export const renderOpenApi = (): string => `${JSON.stringify(buildOpenApi(routes), null, 2)}\n`;

if (import.meta.main) writeFileSync(OUTPUT, renderOpenApi());
