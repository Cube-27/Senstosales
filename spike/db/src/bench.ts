// 5k-row batch timing (SPEC-01 §4.3). One batch = 1 po + 5000 po_item + 1 audit_log row, each a single-row INSERT
// (D1 caps bound parameters per statement, so multi-row VALUES is not the portable shape). File DB with the §8.3
// PRAGMAs. Usage: node src/bench.ts [runs]
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { backupTo, migrationStatements, openNodeDb } from "./node-executor.ts";
import { auditLog, po, poItem } from "./schema.ts";

const ROWS = 5000;
const runs = Number(process.argv[2] ?? 10);
const dir = mkdtempSync(join(tmpdir(), "spike-bench-"));
const handle = openNodeDb(join(dir, "bench.db"));
handle.migrate(migrationStatements());
const { db } = handle;

function build(run: number) {
  const poId = `P${run}`;
  return [
    db.insert(po).values({ id: poId, supplierId: "S1", poNumber: String(run), poDate: "2026-04-01" }),
    ...Array.from({ length: ROWS }, (_, i) =>
      db.insert(poItem).values({ id: `${poId}-${i}`, poId, poItemNo: i + 1, ordQtyM: 1000 * (i + 1), rateU5: 12_345 }),
    ),
    db.insert(auditLog).values({ id: `A${run}`, at: "2026-04-01T00:00:00Z", action: "bench", entityId: poId }),
  ] as const;
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0], median: s[Math.floor(s.length / 2)], max: s.at(-1), n: s.length };
};
const ms = (x: number) => Math.round(x * 10) / 10;

// Drizzle builds SQL lazily inside batch(), so "end to end" includes it. "Execute only" runs the same statements,
// prebuilt with toSQL(), straight through the executor's batch (BEGIN IMMEDIATE … COMMIT).
const total: number[] = [];
const execOnly: number[] = [];
for (let run = 0; run < runs; run++) {
  const t0 = performance.now();
  await db.batch(build(run));
  total.push(performance.now() - t0);

  const queries = build(runs + run).map((q) => ({ ...q.toSQL(), method: "run" as const }));
  const t1 = performance.now();
  handle.batchRaw(queries);
  execOnly.push(performance.now() - t1);
}

const count = handle.raw.prepare("SELECT count(*) AS n FROM po_item").get()!.n;
const b0 = performance.now();
await backupTo(handle.raw, join(dir, "copy.db"));
const backupMs = performance.now() - b0;

const fmt = (o: ReturnType<typeof stats>) => `min ${ms(o.min)} / median ${ms(o.median)} / max ${ms(o.max!)} ms (n=${o.n})`;
console.log(`node ${process.version}, sqlite ${process.versions.sqlite}, ${process.platform}`);
console.log(`5k-row batch via drizzle db.batch: ${fmt(stats(total))}; first run ${ms(total[0])} ms`);
console.log(`5k-row batch, execute only:        ${fmt(stats(execOnly))}`);
console.log(`rows written: ${count}; backup of ${(statSync(join(dir, "copy.db")).size / 1e6).toFixed(1)} MB: ${ms(backupMs)} ms`);
handle.raw.close();
rmSync(dir, { recursive: true, force: true });
