// Service-test setup: a freshly migrated in-memory DB holding supplier `S1`, a Storage kept in memory and a fixed
// Clock. Synthetic values only (C1).
import type { Instant } from "@senstosales/db";
import { supplier } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { IsoDate } from "@senstosales/domain";

import type { Clock } from "../src/ports/clock.ts";
import type { Storage } from "../src/ports/storage.ts";
import { migratedDb } from "./db.ts";

export const SUPPLIER = "S1";
export const NOW = "2025-06-01T05:30:00.000Z" as Instant;

/** A migrated DB (in memory unless `path` is given) holding supplier `S1`. The caller closes it. */
export async function supplierDb(path?: string): Promise<NodeDb> {
  const db = await migratedDb(path);
  await db.batch([
    db.build.insert(supplier).values({ id: SUPPLIER, name: "Example Supplier", bankDetails: {}, invoiceDefaults: {} }),
  ]);
  return db;
}

export const fixedClock: Clock = { today: () => "2025-06-01" as IsoDate, now: () => NOW };

/** A Storage over a Map, so a test can read what was stored. */
export function memoryStorage(): Storage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    put: async (key, bytes) => void files.set(key, bytes),
    get: async (key) => files.get(key) ?? null,
    delete: async (key) => void files.delete(key),
    list: async (prefix) => [...files.keys()].filter((key) => key.startsWith(prefix)),
  };
}
