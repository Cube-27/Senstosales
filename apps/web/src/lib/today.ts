import type { IsoDate } from "@senstosales/domain";
import { istDateOf } from "@senstosales/schemas/formatters";

/** Today's IST calendar date on this machine's clock (dates are IST calendar dates, C3). */
export const todayIst = (): IsoDate => istDateOf(new Date().toISOString());
