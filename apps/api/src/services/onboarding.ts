// First-run onboarding (INV-78, ARCHITECTURE §10.3): creates the supplier and its GST rates in one batch with one
// audit row, from what the user typed only; nothing identifying is seeded. It answers only while no supplier exists.
import { seedStatements, WriteBatch, type GstRates } from "@senstosales/db";

import { ConflictError } from "../errors.ts";
import { newId } from "../ids.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";
import { ratesForAudit } from "./settings.ts";
import type { Supplier, SupplierBody } from "./supplier.ts";

const alreadySetUp = () => new ConflictError("already-set-up", "The supplier details are already set up.");

export function createOnboardingService({ db, clock, supplierId }: SupplierDeps) {
  return {
    done: async (): Promise<boolean> => (await supplierId.find()) !== undefined,

    async complete({ cgstPct, sgstPct, ...body }: SupplierBody & GstRates): Promise<Supplier> {
      if ((await supplierId.find()) !== undefined) throw alreadySetUp();
      const row: Supplier = { ...body, id: newId() };
      const after = { ...row, ...ratesForAudit({ cgstPct, sgstPct }) };
      const batch = new WriteBatch(db).add(repo.insertSupplier(db, row)).add(repo.assertOneSupplier(db));
      for (const statement of seedStatements(db, row.id, { cgstPct, sgstPct })) batch.add(statement);
      batch.add(audit(db, clock.now(), { action: "supplier.create", entityType: "supplier", entityId: row.id, after }));
      try {
        await batch.commit();
      } catch (err) {
        // An overlapping onboarding committed first.
        if (repo.isSecondSupplier(err)) throw alreadySetUp();
        throw err;
      }
      return row;
    },
  };
}
