// SRV references and item matching (ARCHITECTURE §6.10, spec §3, §8).
import type { IsoDate } from "./dates.ts";
import { docKey, fyOf } from "./fy.ts";

/** A DC or an invoice an SRV line may cite; callers pass one document kind at a time (INV-23). */
type DocCandidate = { id: string; number: string; date: IsoDate };

/** A PO item as SRV matching sees it; a stored item or SRV line may lack a material code. */
type PoItemRef = { id: string; materialCode: string | null; poItemNo: number };

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
 * INV-39: the id of the PO item with the SRV line's material code; when the code is on several items, the SRV row's
 * PO item number decides (A2-7). No match, or no code on the line, is `null`: the line is stored unmatched (EC-12).
 */
export function matchSrvItem(
  { materialCode, poItemNo }: Pick<PoItemRef, "materialCode" | "poItemNo">,
  poItems: readonly PoItemRef[],
): string | null {
  if (materialCode === null) return null;
  const byCode = poItems.filter((item) => item.materialCode === materialCode);
  return (byCode.length === 1 ? byCode[0] : byCode.find((item) => item.poItemNo === poItemNo))?.id ?? null;
}
