// The SPA build (SPEC-14 §1): React with TanStack Router file routes. The router plugin reads `tsr.config.json`,
// regenerates `src/routeTree.generated.ts` and splits each route into its own chunk.
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [tanstackRouter(), react(), tailwindcss()],
});
