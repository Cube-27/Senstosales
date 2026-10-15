import type { IsoDate } from "@senstosales/domain";
import { fmtInstantDate, parseDateInput } from "@senstosales/schemas/formatters";

/** Today's IST calendar date, the legacy create forms' default document date. */
export const todayIst = (): IsoDate | "" => parseDateInput(fmtInstantDate(new Date().toISOString())) ?? "";
