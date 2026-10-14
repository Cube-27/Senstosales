// The seed (SPEC-05 §2, INV-78): GST defaults only. No supplier identity and no buyer rows (D-0003); onboarding
// creates the supplier and writes these settings rows in its batch.
import { pctToString, type GstPct } from "@senstosales/domain";

import type { Db, Statement } from "./port.ts";
import { settings } from "./schema/supplier.ts";

export interface GstRates {
  cgstPct: GstPct;
  sgstPct: GstPct;
}

/** The legacy defaults onboarding pre-fills: 9 % CGST and 9 % SGST. IGST is shown but unused (A2-4). */
export const GST_DEFAULTS: GstRates = { cgstPct: 900000 as GstPct, sgstPct: 900000 as GstPct };

/** The `settings` keys that hold the GST rates. */
export const GST_KEYS = { cgstPct: "cgst_pct", sgstPct: "sgst_pct" } as const;

/** The supplier's GST settings rows, for onboarding's batch. */
export function seedStatements(db: Db, supplierId: string, rates: GstRates = GST_DEFAULTS): Statement[] {
  return [
    db.build.insert(settings).values([
      { supplierId, key: GST_KEYS.cgstPct, value: pctToString(rates.cgstPct) },
      { supplierId, key: GST_KEYS.sgstPct, value: pctToString(rates.sgstPct) },
    ]),
  ];
}
