// The Secrets port over the `secret` table (ARCHITECTURE §10.2): the BHEL password, stored simply (A-17). `get` is
// for the services that log in to the portal; no route returns the value, and the audit row of a change carries no
// value (INV-81).
import { WriteBatch } from "@senstosales/db";

import type { SecretName, Secrets } from "../ports/secrets.ts";
import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";

export function createSecretsService({ db, clock, supplierId }: SupplierDeps): Secrets {
  return {
    async get(name: SecretName): Promise<string | null> {
      return repo.findSecret(db, await supplierId.require(), name);
    },

    async set(name: SecretName, value: string | null): Promise<void> {
      const id = await supplierId.require();
      const [write, action] =
        value === null
          ? [repo.deleteSecret(db, id, name), "secret.clear"]
          : [repo.upsertSecret(db, id, name, value), "secret.set"];
      await new WriteBatch(db)
        .add(write)
        .add(audit(db, clock.now(), { action, entityType: "secret", entityId: id }))
        .commit();
    },
  };
}
