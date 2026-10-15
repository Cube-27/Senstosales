// Global search (SPEC-10 §2): PO, DC, invoice and SRV numbers, item material codes, drawing numbers and descriptions,
// and party names, as the legacy search finds them; FY on DC and invoice hits (INV-24). At most five hits of each
// type, the exact number first. Quantities and values come from the domain or stored columns (C2).
import type { Db } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { qtyValue, srvTotals, sumMoney, sumQty } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { linkedDocsOfPo } from "../repositories/po-list.ts";
import type { SearchQuery, Terms } from "../repositories/search.ts";
import * as repo from "../repositories/search.ts";
import { inValueRange } from "./paging.ts";

type Hit = z.output<(typeof routes)["search.query"]["response"]>[number];
type DocType = Hit["type"];

/** The legacy search shows this many hits of each type. */
const PER_TYPE = 5;
const TYPES: readonly DocType[] = ["po", "dc", "invoice", "srv"];

/**
 * Legacy: `*` is no text, so it lists everything a filter keeps (and nothing without one); digits alone skip party
 * names, and a single digit skips items too.
 */
function terms(text: string): Terms {
  const trimmed = text.trim();
  const q = trimmed === "*" ? "" : trimmed;
  const numeric = /^\d+$/.test(q);
  return { q, numeric, items: !numeric || q.length >= 2 };
}

const hasFilter = (f: SearchQuery) =>
  [f.types, f.from, f.to, f.valueMin, f.valueMax].some((value) => value !== undefined);

const startsWithText = (text: string, q: string) => text.toLowerCase().startsWith(q.toLowerCase());

/** What matched, for the result row: the number, else the item field, else the other matched text. */
const matchOf = (t: Terms, number: string, itemMatch: string | null, other: string | null = null) =>
  startsWithText(number, t.q) ? number : (itemMatch ?? other ?? number);

/** The rank the hits are merged by: exact number, number prefix, anything else. */
function rankOf(t: Terms, hit: Hit): number {
  if (hit.number === t.q) return 0;
  return startsWithText(hit.number, t.q) ? 1 : 2;
}

/** A PO link carries a date; a PO without one (never from a BHEL page) is shown without the link. */
const poLink = (ref: { id: string; number: string; date: IsoDate | null } | null) =>
  ref?.date ? { id: ref.id, number: ref.number, date: ref.date } : null;

export function searchService({ db }: { db: Db }) {
  async function pos(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const rows = await repo.searchPos(db, t, f, PER_TYPE);
    return Promise.all(
      rows.map(async ({ itemMatch, ...row }) => ({
        ...row,
        type: "po" as const,
        financialYear: null,
        party: null,
        match: matchOf(t, row.number, itemMatch),
        links: { ...(await linkedDocsOfPo(db, row.id)), po: null },
      })),
    );
  }

  async function dcs(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const rows = await repo.searchDcs(db, t, f, PER_TYPE);
    return Promise.all(
      rows.map(async ({ itemMatch, po, ...row }) => {
        const [lines, invoices, srvs] = await repo.dcExtras(db, row.id);
        return {
          ...row,
          type: "dc" as const,
          match: matchOf(t, row.number, itemMatch, row.party),
          status: null,
          qty: sumQty(lines.map((l) => l.qty)),
          value: sumMoney(lines.map((l) => qtyValue(l.qty, l.rate))),
          links: { dcs: [], invoices, srvs, po: poLink(po) },
        };
      }),
    );
  }

  async function invoices(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const rows = await repo.searchInvoices(db, t, f, PER_TYPE);
    return Promise.all(
      rows.map(async ({ itemMatch, po, dcId, ...row }) => {
        const [lines, dcs, srvs] = await repo.invoiceExtras(db, row.id, dcId);
        return {
          ...row,
          type: "invoice" as const,
          match: matchOf(t, row.number, itemMatch, row.party),
          status: null,
          qty: sumQty(lines.map((l) => l.qty)),
          links: { dcs, invoices: [], srvs, po: poLink(po) },
        };
      }),
    );
  }

  /** The value range applies to the SRV's accepted value, so it is checked before the first five are kept. */
  async function srvs(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const ranged = f.valueMin !== undefined || f.valueMax !== undefined;
    const rows = await repo.searchSrvs(db, t, f, ranged ? undefined : PER_TYPE);
    const lines = Map.groupBy(
      await repo.srvLinesOf(
        db,
        rows.map((r) => r.id),
      ),
      (line) => line.srvId,
    );
    const totalled = rows.map((row) => ({ row, totals: srvTotals(lines.get(row.id) ?? []) }));
    const kept = totalled.filter(({ totals }) => inValueRange(totals.value, f)).slice(0, PER_TYPE);
    return Promise.all(
      kept.map(async ({ row: { itemMatch, po, poNumber, ...row }, totals }) => {
        const [dcs, invoices] = await repo.srvLinks(db, row.id);
        return {
          ...row,
          type: "srv" as const,
          financialYear: null,
          party: null,
          // Not the number or an item: the PO number matched.
          match: matchOf(t, row.number, itemMatch, poNumber),
          status: null,
          qty: totals.acceptedQty,
          value: totals.value,
          links: { dcs, invoices, srvs: [], po: poLink(po) },
        };
      }),
    );
  }

  const byType = { po: pos, dc: dcs, invoice: invoices, srv: srvs };

  return {
    /** No text and no filter finds nothing, as legacy. */
    async query(f: SearchQuery): Promise<Hit[]> {
      const t = terms(f.q);
      if (t.q === "" && !hasFilter(f)) return [];
      const types = TYPES.filter((type) => f.types === undefined || f.types.includes(type));
      const hits = (await Promise.all(types.map((type) => byType[type](t, f)))).flat();
      // A stable sort keeps the type order and each type's own order within a rank.
      return hits.sort((a, b) => rankOf(t, a) - rankOf(t, b));
    },
  };
}

export type SearchService = ReturnType<typeof searchService>;
