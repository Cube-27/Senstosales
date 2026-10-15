import type { IsoDate } from "@senstosales/domain";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiQuery } from "../lib/api.ts";

/** The legacy create forms checked the typed number 500 ms after the last keystroke. */
export const NUMBER_CHECK_DELAY_MS = 500;

export interface NumberCheck {
  /** A check for the current number and date has not answered yet. */
  readonly checking: boolean;
  /** `(number, FY of date)` is taken (INV-22). */
  readonly taken: boolean;
}

/**
 * A create form's live duplicate check of its typed number (INV-22, INV-27): asked once typing pauses, for numbers of
 * at least `minLength` characters (the legacy invoice form checked from 3).
 */
export function useNumberCheck(
  route: "dc.numberCheck" | "invoice.numberCheck",
  typed: string,
  date: IsoDate | "",
  minLength = 1,
): NumberCheck {
  const number = typed.trim();
  const [asked, setAsked] = useState({ number, date });
  useEffect(() => {
    const timer = setTimeout(() => setAsked({ number, date }), NUMBER_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [number, date]);
  const wanted = number.length >= minLength && date !== "";
  const enabled = wanted && asked.number.length >= minLength && asked.date !== "";
  const query = useQuery({
    ...apiQuery(route, { query: asked.date === "" ? { number: asked.number } : { ...asked, date: asked.date } }),
    enabled,
    // A previous number's answer must never show for this one.
    placeholderData: () => undefined,
  });
  const current = asked.number === number && asked.date === date;
  return {
    checking: wanted && (!current || query.isFetching),
    taken: wanted && current && query.data?.taken === true,
  };
}
