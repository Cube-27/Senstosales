// The supplier row, its settings rows and its secret (ARCHITECTURE §8.2): reads return plain rows, writes return
// statements for the service's batch.
import { DbError, insertRows, secret, settings, supplier, type Db, type Statement } from "@senstosales/db";
import { and, eq, sql } from "drizzle-orm";

export type Supplier = typeof supplier.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;

/** The install's one supplier (A2-12), or `null` before onboarding. */
export async function findSupplier(db: Db): Promise<Supplier | null> {
  const rows = await db.query(db.build.select().from(supplier).limit(1));
  return rows[0] ?? null;
}

/** The supplier details a DC or invoice carries (`supplierSnapshot`), from the supplier row as it stands. */
export const supplierSnapshotOf = (row: Supplier | null) => ({
  supplierName: row?.name ?? null,
  supplierAddress: row?.address ?? null,
  supplierGstin: row?.gstin ?? null,
  supplierContact: row?.contact ?? null,
});

export async function findSupplierId(db: Db): Promise<string | null> {
  const rows = await db.query(db.build.select({ id: supplier.id }).from(supplier).limit(1));
  return rows[0]?.id ?? null;
}

export const insertSupplier = (db: Db, row: Supplier): Statement => db.build.insert(supplier).values(row);

/**
 * Fails the batch it ends when it would leave more than one supplier: the second row's `name` becomes NULL, its NOT
 * NULL constraint fails and the whole batch rolls back. Two overlapping onboardings then create one supplier.
 */
export const assertOneSupplier = (db: Db): Statement =>
  db.build
    .update(supplier)
    .set({ name: sql`NULL` })
    .where(sql`(SELECT count(*) FROM ${supplier}) > 1`);

/** Whether `err` is the failure `assertOneSupplier` causes. */
export const isSecondSupplier = (err: unknown): boolean =>
  err instanceof DbError && err.message.includes("NOT NULL constraint failed: supplier.name");

export const updateSupplier = (db: Db, row: Supplier): Statement =>
  db.build.update(supplier).set(row).where(eq(supplier.id, row.id));

export const settingsOf = (db: Db, supplierId: string): Promise<SettingRow[]> =>
  db.query(db.build.select().from(settings).where(eq(settings.supplierId, supplierId)));

export const deleteSettings = (db: Db, supplierId: string): Statement =>
  db.build.delete(settings).where(eq(settings.supplierId, supplierId));

/** Any number of preferences: as many rows to a statement as D1 binds. */
export const insertSettings = (db: Db, rows: SettingRow[]): Statement[] => insertRows(db, settings, rows);

export async function findSecret(db: Db, supplierId: string, name: string): Promise<string | null> {
  const rows = await db.query(
    db.build
      .select({ value: secret.value })
      .from(secret)
      .where(and(eq(secret.supplierId, supplierId), eq(secret.name, name)))
      .limit(1),
  );
  return rows[0]?.value ?? null;
}

export const upsertSecret = (db: Db, supplierId: string, name: string, value: string): Statement =>
  db.build
    .insert(secret)
    .values({ supplierId, name, value })
    .onConflictDoUpdate({ target: [secret.supplierId, secret.name], set: { value } });

export const deleteSecret = (db: Db, supplierId: string, name: string): Statement =>
  db.build.delete(secret).where(and(eq(secret.supplierId, supplierId), eq(secret.name, name)));
