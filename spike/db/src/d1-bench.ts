// The bench.ts 5k-row batch on local D1 (miniflare/workerd via wrangler). Informative only: local D1 is not the
// hosted service. Usage: node src/d1-bench.ts [runs]
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";

import { auditLog, po, poItem } from "./schema.ts";

const ROWS = 5000;
const runs = Number(process.argv[2] ?? 5);
const root = join(import.meta.dirname, "..");
const persist = mkdtempSync(join(tmpdir(), "spike-d1-bench-"));
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", "--local", "--persist-to", persist, "--file", "migrations/0000_init.sql", "--yes"], { cwd: root, stdio: "pipe" });
const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: { path: join(persist, "v3") }, configPath: join(root, "wrangler.jsonc") });
const db = drizzle(proxy.env.DB);

const times: number[] = [];
for (let run = 0; run < runs; run++) {
  const poId = `P${run}`;
  const t0 = performance.now();
  await db.batch([
    db.insert(po).values({ id: poId, supplierId: "S1", poNumber: String(run), poDate: "2026-04-01" }),
    ...Array.from({ length: ROWS }, (_, i) =>
      db.insert(poItem).values({ id: `${poId}-${i}`, poId, poItemNo: i + 1, ordQtyM: 1000 * (i + 1), rateU5: 12_345 }),
    ),
    db.insert(auditLog).values({ id: `A${run}`, at: "2026-04-01T00:00:00Z", action: "bench", entityId: poId }),
  ]);
  times.push(performance.now() - t0);
}
const s = [...times].sort((a, b) => a - b);
const r = (x: number) => Math.round(x);
console.log(`local D1 5k-row batch: min ${r(s[0])} / median ${r(s[Math.floor(s.length / 2)])} / max ${r(s.at(-1)!)} ms (n=${s.length})`);
await proxy.dispose();
rmSync(persist, { recursive: true, force: true });
