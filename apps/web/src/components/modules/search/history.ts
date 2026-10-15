// Recent and saved searches (legacy): kept in this browser only, under the legacy keys. Storage can be missing or
// refuse writes (private windows); the dialog then works without them.
import { zIsoDate } from "@senstosales/schemas";
import { useCallback, useState } from "react";
import { z } from "zod";

import { DOC_TYPES, type Filters, NO_FILTERS } from "./filters.ts";

export interface RecentSearch {
  readonly query: string;
  readonly filters: Filters;
  readonly timestamp: string;
}

export interface SavedSearch {
  readonly id: string;
  readonly name: string;
  readonly filters: Filters;
  readonly createdAt: string;
}

const RECENT_KEY = "sensto_recent_searches";
const SAVED_KEY = "sensto_saved_searches";
/** Legacy keeps ten recent searches and shows five. */
const RECENT_KEPT = 10;

const zDate = zIsoDate.or(z.literal("")).catch("");

/** Stored filters as the dialog uses them: unknown types dropped, unreadable fields blank. */
const zStoredFilters = z
  .object({
    types: z
      .array(z.string())
      .catch([...DOC_TYPES])
      .transform((types) => DOC_TYPES.filter((t) => types.includes(t))),
    dateFrom: zDate,
    dateTo: zDate,
    amountMin: z.string().catch(""),
    amountMax: z.string().catch(""),
  })
  .catch(() => ({ ...NO_FILTERS, types: [...DOC_TYPES] }));

const zRecent = z.object({ query: z.string(), timestamp: z.string(), filters: zStoredFilters });
const zSaved = z.object({ id: z.string(), name: z.string(), createdAt: z.string(), filters: zStoredFilters });

/** The readable entries stored under `key`; anything else is skipped. */
function read<T>(key: string, schema: z.ZodType<T>): T[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item: unknown) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage refused: the list lives until the page closes.
  }
}

/** The calendar day of a stored timestamp, for the recent-search line; null when unreadable. */
export function dayOf(timestamp: string) {
  const day = zIsoDate.safeDecode(timestamp.slice(0, 10));
  return day.success ? day.data : null;
}

export const loadRecent = (): RecentSearch[] => read(RECENT_KEY, zRecent);
export const loadSaved = (): SavedSearch[] => read(SAVED_KEY, zSaved);

export function useSearchHistory() {
  const [recent, setRecent] = useState(loadRecent);
  const [saved, setSaved] = useState(loadSaved);

  /** The newest first; the same text replaces its older entry. */
  const addRecent = useCallback(
    (query: string, filters: Filters): void =>
      setRecent((list) => {
        const next = [
          { query, filters, timestamp: new Date().toISOString() },
          ...list.filter((r) => r.query !== query),
        ].slice(0, RECENT_KEPT);
        write(RECENT_KEY, next);
        return next;
      }),
    [],
  );

  const save = (name: string, filters: Filters): void =>
    setSaved((list) => {
      const next = [
        ...list,
        { id: crypto.randomUUID(), name: name.trim(), filters, createdAt: new Date().toISOString() },
      ];
      write(SAVED_KEY, next);
      return next;
    });

  const remove = (id: string): void =>
    setSaved((list) => {
      const next = list.filter((s) => s.id !== id);
      write(SAVED_KEY, next);
      return next;
    });

  return { recent, saved, addRecent, save, remove };
}
