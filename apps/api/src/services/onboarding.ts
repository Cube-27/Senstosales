// First-run onboarding (INV-78, ARCHITECTURE §10.3): creates the supplier and its GST rates in one batch with one
// audit row, from what the user typed only; nothing identifying is seeded. It answers only while no supplier exists.
import { DbError, seedStatements, WriteBatch, type GstRates } from "@senstosales/db";
import { pctToString } from "@senstosales/domain";

import { ConflictError } from "../errors.ts";
import { newId } from "../ids.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { ServiceDeps } from "./index.ts";
import type { Supplier, SupplierBody } from "./supplier.ts";

const alreadySetUp = () => new ConflictError("already-set-up", "The supplier details are already set up.");

export function createOnboardingService({ db, clock }: ServiceDeps) {
  const done = async (): Promise<boolean> => (await repo.findSupplier(db)) !== null;

  return {
    done,

    async complete({ cgstPct, sgstPct, ...body }: SupplierBody & GstRates): Promise<Supplier> {
      if (await done()) throw alreadySetUp();
      const row: Supplier = { ...body, id: newId() };
      const after = { ...row, cgstPct: pctToString(cgstPct), sgstPct: pctToString(sgstPct) };
      const batch = new WriteBatch(db).add(repo.insertSupplier(db, row)).add(repo.assertOneSupplier(db));
      for (const statement of seedStatements(db, row.id, { cgstPct, sgstPct })) batch.add(statement);
      batch.add(audit(db, clock.now(), { action: "onboarding", entityType: "supplier", entityId: row.id, after }));
      try {
        await batch.commit();
      } catch (err) {
        // An overlapping onboarding committed first, and `assertOneSupplier` rolled this one back.
        if (err instanceof DbError && (await done())) throw alreadySetUp();
        throw err;
      }
      return row;
    },
  };
}
