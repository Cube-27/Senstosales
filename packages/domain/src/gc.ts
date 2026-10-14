// Guarantee certificate defaults (spec §9, A2-5).
import type { IsoDate } from "./dates.ts";

type GcInput = {
  dcNumber: string;
  dcDate: IsoDate;
  gcNumber?: string | null;
  gcDate?: IsoDate | null;
};

/** INV-26: a blank GC number becomes the DC number and a blank GC date the DC date; a given number is kept as typed. */
export function defaultGc({ dcNumber, dcDate, gcNumber, gcDate }: GcInput): { gcNumber: string; gcDate: IsoDate } {
  return { gcNumber: gcNumber?.trim() ? gcNumber : dcNumber, gcDate: gcDate ?? dcDate };
}
