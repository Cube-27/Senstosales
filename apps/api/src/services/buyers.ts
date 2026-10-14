// Buyers (INV-86): the BHEL units the supplier sells to, with the legacy add, edit and delete.
import { WriteBatch } from "@senstosales/db";

import { NotFoundError } from "../errors.ts";
import { newId } from "../ids.ts";
import * as repo from "../repositories/buyers.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";

export type Buyer = repo.Buyer;
export type BuyerBody = Omit<Buyer, "id">;

export function createBuyersService({ db, clock, supplierId }: SupplierDeps) {
  /** Buyer `id` of the supplier, or 404. */
  async function load(id: string): Promise<Buyer> {
    const buyer = await repo.findBuyer(db, await supplierId.require(), id);
    if (buyer === null) throw new NotFoundError("not-found", "This buyer was not found.");
    return buyer;
  }

  return {
    async list(): Promise<Buyer[]> {
      return repo.listBuyers(db, await supplierId.require());
    },

    async create(body: BuyerBody): Promise<Buyer> {
      const after = { ...body, id: newId() };
      await new WriteBatch(db)
        .add(repo.insertBuyer(db, { ...after, supplierId: await supplierId.require() }))
        .add(audit(db, clock.now(), { action: "create-buyer", entityType: "buyer", entityId: after.id, after }))
        .commit();
      return after;
    },

    async update(id: string, body: BuyerBody): Promise<Buyer> {
      const before = await load(id);
      const after = { ...body, id };
      await new WriteBatch(db)
        .add(repo.updateBuyer(db, after))
        .add(audit(db, clock.now(), { action: "update-buyer", entityType: "buyer", entityId: id, before, after }))
        .commit();
      return after;
    },

    async delete(id: string): Promise<void> {
      const before = await load(id);
      await new WriteBatch(db)
        .add(repo.deleteBuyer(db, id))
        .add(audit(db, clock.now(), { action: "delete-buyer", entityType: "buyer", entityId: id, before }))
        .commit();
    },
  };
}
