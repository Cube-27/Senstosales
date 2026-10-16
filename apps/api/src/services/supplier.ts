// The supplier profile (A2-12): one per install, created by onboarding, edited in Settings.
import { WriteBatch, type Db } from "@senstosales/db";

import { onboardingRequired } from "../errors.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";

export type Supplier = repo.Supplier;
export type SupplierBody = Omit<Supplier, "id">;

/**
 * The supplier id, which every other write belongs to. Read on every call, never kept: a restore can replace the data
 * with a backup that holds another supplier or none, and the onboarding gate must see that at once (N-RESTORE).
 */
export function supplierRef(db: Db) {
  const find = async (): Promise<string | undefined> => (await repo.findSupplierId(db)) ?? undefined;
  return {
    find,
    async require(): Promise<string> {
      const id = await find();
      if (id === undefined) throw onboardingRequired();
      return id;
    },
  };
}

export type SupplierRef = ReturnType<typeof supplierRef>;

export function createSupplierService({ db, clock }: SupplierDeps) {
  async function get(): Promise<Supplier> {
    const row = await repo.findSupplier(db);
    if (row === null) throw onboardingRequired();
    return row;
  }

  return {
    get,

    async update(body: SupplierBody): Promise<Supplier> {
      const before = await get();
      const after = { ...body, id: before.id };
      await new WriteBatch(db)
        .add(repo.updateSupplier(db, after))
        .add(
          audit(db, clock.now(), {
            action: "supplier.update",
            entityType: "supplier",
            entityId: after.id,
            before,
            after,
          }),
        )
        .commit();
      return after;
    },
  };
}
