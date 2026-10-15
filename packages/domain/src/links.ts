// SRV references and item matching (ARCHITECTURE §6.10, spec §3, §8).
import type { IsoDate } from "./dates.ts";
import { docKey, fyOf } from "./fy.ts";

/** A DC or an invoice an SRV line may cite; callers pass one document kind at a time (INV-23). */
type DocCandidate = { id: string; number: string; date: IsoDate };

/**
 * INV-37, INV-24: the id of the candidate with the cited number in the FY of the SRV date, else `null`. A March DC
 * cited by an April SRV is not linked (EC-03); numbers are compared through `docKey` (trim only, EC-16).
 */
export function resolveDocLink(
  raw: string | null,
  srvDate: IsoDate,
  candidates: readonly DocCandidate[],
): string | null {
  if (!raw?.trim()) return null;
  const key = docKey(raw, fyOf(srvDate));
  return candidates.find((c) => docKey(c.number, fyOf(c.date)) === key)?.id ?? null;
}

/**
 * INV-39: the id of the PO item with the SRV row's PO item number (A2-7, revised 2026-10-15); the material code and
 * lot play no part. No such item is `null`: the line is stored unmatched and flagged (EC-12).
 */
export function matchSrvItem(poItemNo: number, poItems: readonly { id: string; poItemNo: number }[]): string | null {
  return poItems.find((item) => item.poItemNo === poItemNo)?.id ?? null;
}
