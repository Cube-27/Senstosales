// The supplier profile (A2-12): one per install, created by onboarding, edited in Settings.
import { WriteBatch, type Db } from "@senstosales/db";

import { onboardingRequired } from "../errors.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";

export type Supplier = repo.Supplier;
export type SupplierBody = Omit<Supplier, "id">;

/**
 * The supplier id, which every other write belongs to. Once found it is kept: no route deletes the supplier, so the
 * onboarding gate and the services read it without a query. A restore replaces the data, so it `forget`s the id.
 */
export function supplierRef(db: Db) {
  let known: string | undefined;
  const find = async (): Promise<string | undefined> => (known ??= (await repo.findSupplierId(db)) ?? undefined);
  return {
    find,
    forget(): void {
      known = undefined;
    },
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
