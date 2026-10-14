// drizzle-kit generates each migration from the schema; it is reviewed and committed (SPEC-05 §2). Run from this
// package: `pnpm exec drizzle-kit generate --name <name>`, then `pnpm gen:migrations` at the repo root. Versions
// start at 1 (`0001_init`): the journal's first entry has `idx: 1`, so drizzle-kit numbers the next one 0002.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
