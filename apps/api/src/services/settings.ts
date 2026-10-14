// Settings (A2-4): the GST percentages copied onto each invoice and the settings-page preferences, all `settings`
// rows of the supplier. An update replaces every row.
import { GST_KEYS, WriteBatch, type GstRates } from "@senstosales/db";
import { parsePct, pctToString } from "@senstosales/domain";

import * as repo from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { ServiceDeps } from "./index.ts";
import { requireSupplier } from "./supplier.ts";

export interface Settings extends GstRates {
  preferences: Record<string, string>;
}

const GST_KEY_SET = new Set<string>(Object.values(GST_KEYS));

function toSettings(rows: readonly repo.SettingRow[]): Settings {
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const rate = (key: string) => {
    const parsed = parsePct(values.get(key) ?? "");
    if (!parsed.ok) throw new Error(`Setting ${key}: ${parsed.error}`);
    return parsed.value;
  };
  const preferences = Object.fromEntries(rows.filter((r) => !GST_KEY_SET.has(r.key)).map((r) => [r.key, r.value]));
  return { cgstPct: rate(GST_KEYS.cgstPct), sgstPct: rate(GST_KEYS.sgstPct), preferences };
}

/** The rows of `s`; a preference that reuses a GST key is dropped, so the rates always win. */
function toRows(supplierId: string, s: Settings): repo.SettingRow[] {
  const preferences = Object.entries(s.preferences).filter(([key]) => !GST_KEY_SET.has(key));
  return [
    { supplierId, key: GST_KEYS.cgstPct, value: pctToString(s.cgstPct) },
    { supplierId, key: GST_KEYS.sgstPct, value: pctToString(s.sgstPct) },
    ...preferences.map(([key, value]) => ({ supplierId, key, value })),
  ];
}

/** The audit form: percentages as their strings. */
const snapshot = (s: Settings) => ({ ...s, cgstPct: pctToString(s.cgstPct), sgstPct: pctToString(s.sgstPct) });

export function createSettingsService({ db, clock }: ServiceDeps) {
  return {
    async get(): Promise<Settings> {
      const { id } = await requireSupplier(db);
      return toSettings(await repo.settingsOf(db, id));
    },

    async update(next: Settings): Promise<Settings> {
      const { id } = await requireSupplier(db);
      const before = toSettings(await repo.settingsOf(db, id));
      const rows = toRows(id, next);
      const after = toSettings(rows);
      await new WriteBatch(db)
        .add(repo.deleteSettings(db, id))
        .add(repo.insertSettings(db, rows))
        .add(
          audit(db, clock.now(), {
            action: "update-settings",
            entityType: "settings",
            entityId: id,
            before: snapshot(before),
            after: snapshot(after),
          }),
        )
        .commit();
      return after;
    },
  };
}
