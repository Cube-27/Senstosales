// The Secrets port over the `secret` table (ARCHITECTURE §10.2): the BHEL password, stored simply (A-17). `get` is
// for the services that log in to the portal; no route returns the value, and the audit row of a change carries no
// value (INV-81).
import { WriteBatch } from "@senstosales/db";

import type { SecretName, Secrets } from "../ports/secrets.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { ServiceDeps } from "./index.ts";
import { requireSupplier } from "./supplier.ts";

export function createSecretsService({ db, clock }: ServiceDeps): Secrets {
  return {
    async get(name: SecretName): Promise<string | null> {
      return repo.findSecret(db, (await requireSupplier(db)).id, name);
    },

    async set(name: SecretName, value: string | null): Promise<void> {
      const { id } = await requireSupplier(db);
      await new WriteBatch(db)
        .add(value === null ? repo.deleteSecret(db, id, name) : repo.upsertSecret(db, id, name, value))
        .add(
          audit(db, clock.now(), {
            action: value === null ? `clear-${name}` : `set-${name}`,
            entityType: "secret",
            entityId: id,
          }),
        )
        .commit();
    },
  };
}
