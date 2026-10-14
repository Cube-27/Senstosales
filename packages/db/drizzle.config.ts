// drizzle-kit generates each migration from the schema; it is reviewed and committed (SPEC-05 §2). Run from this
// package: `pnpm exec drizzle-kit generate --name <name>`, then `pnpm gen:migrations` at the repo root.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
