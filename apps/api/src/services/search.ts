// Global search (SPEC-10 §2): PO, DC, invoice and SRV numbers, item material codes, drawing numbers and descriptions,
// and party names, as the legacy search finds them; FY on DC and invoice hits (INV-24). At most five hits of each
// type, the exact number first. Quantities and values come from the domain or stored columns (C2).
import type { Db } from "@senstosales/db";
import { qtyValue, srvTotals, sumMoney, sumQty } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { linkedDocsOfPo } from "../repositories/po-list.ts";
import type { SearchQuery, Terms } from "../repositories/search.ts";
import * as repo from "../repositories/search.ts";

type Hit = z.output<(typeof routes)["search.query"]["response"]>[number];
type DocType = Hit["type"];

/** The legacy search shows this many hits of each type. */
const PER_TYPE = 5;
const TYPES: readonly DocType[] = ["po", "dc", "invoice", "srv"];

/** Legacy: `*` searches for everything; digits alone skip party names, and a single digit skips items too. */
function terms(text: string): Terms {
  const trimmed = text.trim();
  const q = trimmed === "*" ? "" : trimmed;
  const numeric = /^\d+$/.test(q);
  return { q, numeric, party: !numeric, items: !numeric || q.length >= 2 };
}

const hasFilter = (f: SearchQuery) =>
  [f.types, f.from, f.to, f.valueMin, f.valueMax].some((value) => value !== undefined);

const startsWithText = (text: string, q: string) => text.toLowerCase().startsWith(q.toLowerCase());

/** What matched, for the result row: the number, else the item field, else the party. */
const matchOf = (t: Terms, row: { number: string; itemMatch: string | null }, party: string | null = null) =>
  startsWithText(row.number, t.q) ? row.number : (row.itemMatch ?? party ?? row.number);

/** The rank the hits are merged by: exact number, number prefix, anything else. */
const rankOf = (t: Terms, hit: Hit) => (hit.number === t.q ? 0 : startsWithText(hit.number, t.q) ? 1 : 2);

export function searchService({ db }: { db: Db }) {
  const poLink = async (poId: string | null) => {
    const ref = poId === null ? undefined : await repo.poRef(db, poId);
    // A PO reference carries a date; a PO without one (never from a BHEL page) is shown without the link.
    return ref?.date ? { id: ref.id, number: ref.number, date: ref.date } : null;
  };

  async function pos(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const rows = await repo.searchPos(db, t, f, PER_TYPE);
    return Promise.all(
      rows.map(async ({ itemMatch, ...row }) => ({
        ...row,
        type: "po" as const,
        financialYear: null,
        party: null,
        match: matchOf(t, { ...row, itemMatch }),
        links: { ...(await linkedDocsOfPo(db, row.id)), po: null },
      })),
    );
  }

  async function dcs(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const rows = await repo.searchDcs(db, t, f, PER_TYPE);
    return Promise.all(
      rows.map(async ({ itemMatch, poId, ...row }) => {
        const [[lines, invoices, srvs], po] = await Promise.all([repo.dcExtras(db, row.id), poLink(poId)]);
        return {
          ...row,
          type: "dc" as const,
          match: matchOf(t, { ...row, itemMatch }, row.party),
          status: null,
          qty: sumQty(lines.map((l) => l.qty)),
          value: sumMoney(lines.map((l) => qtyValue(l.qty, l.rate))),
          links: { dcs: [], invoices, srvs, po },
        };
      }),
    );
  }

  async function invoices(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const rows = await repo.searchInvoices(db, t, f, PER_TYPE);
    return Promise.all(
      rows.map(async ({ itemMatch, poId, dcId, ...row }) => {
        const [[lines, dcRefs, srvs], po] = await Promise.all([repo.invoiceExtras(db, row.id, dcId), poLink(poId)]);
        return {
          ...row,
          type: "invoice" as const,
          match: matchOf(t, { ...row, itemMatch }, row.party),
          status: null,
          qty: sumQty(lines.map((l) => l.qty)),
          links: { dcs: dcRefs, invoices: [], srvs, po },
        };
      }),
    );
  }

  /** The value range applies to the SRV's accepted value, so it is checked here, before the first five are kept. */
  async function srvs(t: Terms, f: SearchQuery): Promise<Hit[]> {
    const ranged = f.valueMin !== undefined || f.valueMax !== undefined;
    const rows = await repo.searchSrvs(db, t, f, ranged ? undefined : PER_TYPE);
    const hits = await Promise.all(
      rows.map(async ({ itemMatch, poId, poNumber, ...row }) => {
        const [[lines, dcRefs, invoiceRefs], po] = await Promise.all([repo.srvExtras(db, row.id), poLink(poId)]);
        const totals = srvTotals(lines);
        return {
          ...row,
          type: "srv" as const,
          financialYear: null,
          party: null,
          // Not the number or an item: the PO number matched.
          match: matchOf(t, { ...row, itemMatch }, poNumber),
          status: null,
          qty: totals.acceptedQty,
          value: totals.value,
          links: { dcs: dcRefs, invoices: invoiceRefs, srvs: [], po },
        };
      }),
    );
    return hits
      .filter(
        (h) =>
          (f.valueMin === undefined || h.value >= f.valueMin) && (f.valueMax === undefined || h.value <= f.valueMax),
      )
      .slice(0, PER_TYPE);
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
