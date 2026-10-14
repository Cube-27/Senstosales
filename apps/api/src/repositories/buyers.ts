// The BHEL units the supplier sells to (INV-86): reads return plain rows, writes return statements for the batch.
import { buyer, type Db, type Statement } from "@senstosales/db";
import { and, asc, eq } from "drizzle-orm";

export type BuyerRow = typeof buyer.$inferSelect;
export type Buyer = Omit<BuyerRow, "supplierId">;

const columns = {
  id: buyer.id,
  unitName: buyer.unitName,
  state: buyer.state,
  stateCode: buyer.stateCode,
  gstin: buyer.gstin,
};

const ofSupplier = (supplierId: string, id: string) => and(eq(buyer.supplierId, supplierId), eq(buyer.id, id));

export const listBuyers = (db: Db, supplierId: string): Promise<Buyer[]> =>
  db.query(
    db.build.select(columns).from(buyer).where(eq(buyer.supplierId, supplierId)).orderBy(asc(buyer.unitName), buyer.id),
  );

export async function findBuyer(db: Db, supplierId: string, id: string): Promise<Buyer | null> {
  const rows = await db.query(db.build.select(columns).from(buyer).where(ofSupplier(supplierId, id)).limit(1));
  return rows[0] ?? null;
}

export const insertBuyer = (db: Db, row: BuyerRow): Statement => db.build.insert(buyer).values(row);

export const updateBuyer = (db: Db, supplierId: string, { id, ...values }: Buyer): Statement =>
  db.build.update(buyer).set(values).where(ofSupplier(supplierId, id));

export const deleteBuyer = (db: Db, supplierId: string, id: string): Statement =>
  db.build.delete(buyer).where(ofSupplier(supplierId, id));
