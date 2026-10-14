// The supplier profile (A2-12): one per install, created by onboarding, edited in Settings.
import { WriteBatch, type Db } from "@senstosales/db";

import { onboardingRequired } from "../errors.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { ServiceDeps } from "./index.ts";

export type Supplier = repo.Supplier;
export type SupplierBody = Omit<Supplier, "id">;

/** The supplier every other write belongs to. The onboarding gate keeps routes from getting here without one. */
export async function requireSupplier(db: Db): Promise<Supplier> {
  const row = await repo.findSupplier(db);
  if (row === null) throw onboardingRequired();
  return row;
}

export function createSupplierService({ db, clock }: ServiceDeps) {
  return {
    get: () => requireSupplier(db),

    async update(body: SupplierBody): Promise<Supplier> {
      const before = await requireSupplier(db);
      const after = { ...body, id: before.id };
      await new WriteBatch(db)
        .add(repo.updateSupplier(db, after))
        .add(
          audit(db, clock.now(), {
            action: "update-supplier",
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
