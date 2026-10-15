// Settings (A2-4): the GST percentages copied onto each invoice and the settings-page preferences, all `settings`
// rows of the supplier. An update replaces every row.
import { GST_KEYS, seedStatements, WriteBatch, type Db, type GstRates } from "@senstosales/db";
import { parsePct, pctToString } from "@senstosales/domain";

import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";

export interface Settings extends GstRates {
  preferences: Record<string, string>;
}

const isGstKey = (key: string): boolean => key === GST_KEYS.cgstPct || key === GST_KEYS.sgstPct;

/** The rates as the audit row stores them: their strings. */
export const ratesForAudit = (r: GstRates) => ({ cgstPct: pctToString(r.cgstPct), sgstPct: pctToString(r.sgstPct) });

function ratesOf(rows: readonly repo.SettingRow[]): GstRates {
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const rate = (key: string) => {
    const parsed = parsePct(values.get(key) ?? "");
    if (!parsed.ok) throw new Error(`Setting ${key}: ${parsed.error}`);
    return parsed.value;
  };
  return { cgstPct: rate(GST_KEYS.cgstPct), sgstPct: rate(GST_KEYS.sgstPct) };
}

function toSettings(rows: readonly repo.SettingRow[]): Settings {
  const preferences = Object.fromEntries(rows.filter((r) => !isGstKey(r.key)).map((r) => [r.key, r.value]));
  return { ...ratesOf(rows), preferences };
}

/** The supplier's GST rates, which an invoice copies at creation (A2-4). */
export const gstRatesOf = async (db: Db, supplierId: string): Promise<GstRates> =>
  ratesOf(await repo.settingsOf(db, supplierId));

export function createSettingsService({ db, clock, supplierId }: SupplierDeps) {
  return {
    async get(): Promise<Settings> {
      return toSettings(await repo.settingsOf(db, await supplierId.require()));
    },

    /** A preference that reuses a GST key is dropped, so the rates always win. */
    async update({ cgstPct, sgstPct, preferences }: Settings): Promise<Settings> {
      const id = await supplierId.require();
      const before = toSettings(await repo.settingsOf(db, id));
      const kept = Object.entries(preferences).filter(([key]) => !isGstKey(key));
      const after: Settings = { cgstPct, sgstPct, preferences: Object.fromEntries(kept) };
      const batch = new WriteBatch(db).add(repo.deleteSettings(db, id));
      for (const statement of seedStatements(db, id, after)) batch.add(statement);
      if (kept.length > 0) {
        batch.add(
          repo.insertSettings(
            db,
            kept.map(([key, value]) => ({ supplierId: id, key, value })),
          ),
        );
      }
      await batch
        .add(
          audit(db, clock.now(), {
            action: "settings.update",
            entityType: "settings",
            entityId: id,
            before: { ...before, ...ratesForAudit(before) },
            after: { ...after, ...ratesForAudit(after) },
          }),
        )
        .commit();
      return after;
    },
  };
}
