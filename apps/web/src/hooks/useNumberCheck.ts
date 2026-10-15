import type { IsoDate } from "@senstosales/domain";
import { ApiError } from "@senstosales/schemas/errors";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../lib/api.ts";

/** The legacy create forms checked the typed number 500 ms after the last keystroke. */
const NUMBER_CHECK_DELAY_MS = 500;

export interface NumberCheck {
  /** A check for the current number and date has not answered yet. */
  readonly checking: boolean;
  /** `(number, FY of date)` is taken (INV-22): by the live check, or by a save the API refused for it. */
  readonly taken: boolean;
  /** After a refused save: marks the number and date taken when the API refused that number (INV-22). */
  refused(error: unknown, at: { readonly number: string; readonly date: IsoDate }): void;
}

/** The API's 409 code for a taken number of each kind; its other 409s (a taken GC number, a DC already invoiced) are
 * about something else. */
const TAKEN_CODE = { "dc.numberCheck": "dc-number-taken", "invoice.numberCheck": "invoice-number-taken" } as const;

/** Resolves after `ms`, or rejects once `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * A create form's live duplicate check of its typed number (INV-22, INV-27), for numbers of at least `minLength`
 * characters (the legacy invoice form checked from 3). Each keystroke is a new query that first waits out the
 * typing pause on its abort signal, so the query client cancels a superseded check before it reaches the API.
 */
export function useNumberCheck(
  route: "dc.numberCheck" | "invoice.numberCheck",
  typed: string,
  date: IsoDate | "",
  minLength = 1,
): NumberCheck {
  const number = typed.trim();
  const query = useQuery({
    queryKey: [route, { number, date }] as const,
    queryFn: async ({ signal }) => {
      await pause(NUMBER_CHECK_DELAY_MS, signal);
      return api.request(route, { query: date === "" ? { number } : { number, date } });
    },
    enabled: number.length >= minLength && date !== "",
    // A previous number's answer must never show for this one.
    placeholderData: () => undefined,
  });
  const [refusedAt, setRefusedAt] = useState<{ readonly number: string; readonly date: IsoDate } | null>(null);
  return {
    checking: query.isFetching,
    // A refusal stays on its number and date only: another date may fall in a free FY.
    taken: query.data?.taken === true || (refusedAt?.number === number && refusedAt.date === date),
    refused: (error, at) => {
      if (error instanceof ApiError && error.body.code === TAKEN_CODE[route]) setRefusedAt(at);
    },
  };
}
