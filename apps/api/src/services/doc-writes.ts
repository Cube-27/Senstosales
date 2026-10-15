// The steps DC and invoice writes share (SPEC-11 §4.2): the SRV links to a document's numbers, the version-guarded
// recompute of every PO those links or the document's rows touch, and one commit (C4).
import type { Db, Statement } from "@senstosales/db";
import { po, updateWithVersion, WriteBatch } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { fyOf } from "@senstosales/domain";

import { poNotFound } from "../errors.ts";
import type { Clock } from "../ports/clock.ts";
import { dcsNumbered } from "../repositories/dc.ts";
import { invoicesNumbered } from "../repositories/invoice.ts";
import { findPoRow } from "../repositories/po-list.ts";
import { CITATIONS } from "../repositories/srv.ts";
import { reresolveLinks } from "./links.ts";
import type { PoSnapshot } from "./recompute.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";

/** A DC or invoice as stored once the batch commits. */
export type Doc = { id: string; number: string; date: IsoDate };

/** No SRV link changes: an edit that keeps the document's number and FY. */
export const NO_LINKS = { changes: new Map<string, string | null>(), poIds: new Set<string>(), statements: [] };

const NUMBERED = { dc: dcsNumbered, invoice: invoicesNumbered };

export async function loadPo(db: Db, poId: string) {
  const row = await findPoRow(db, poId);
  if (row === undefined) throw poNotFound();
  return row;
}

export function docWrites({ db, clock }: { db: Db; clock: Clock }, kind: keyof typeof CITATIONS) {
  const { key } = CITATIONS[kind];

  /**
   * The PO's version guard and the recompute of its derived columns and flags from `snapshot`, which was read after
   * `version` (D-0220), with this batch's SRV link changes applied.
   */
  function guardedRecompute(snapshot: PoSnapshot, version: number, links: ReadonlyMap<string, string | null>) {
    const srvLines = snapshot.srvLines.map((l) => (links.has(l.id) ? { ...l, [key]: links.get(l.id) ?? null } : l));
    return [
      updateWithVersion(db, po, snapshot.po.id, version, {}),
      ...recomputeStatements({ db, clock }, { ...snapshot, srvLines }),
    ];
  }

  /** The recompute of every other PO with an SRV item whose link changes: its DOC_NUMBER_CONFLICT may change. */
  async function otherPos(poIds: ReadonlySet<string>, own: string, links: ReadonlyMap<string, string | null>) {
    const others = [...poIds].filter((poId) => poId !== own);
    const statements = await Promise.all(
      others.map(async (poId) => {
        const { version } = await loadPo(db, poId);
        return guardedRecompute(await loadPoSnapshot(db, poId), version, links);
      }),
    );
    return statements.flat();
  }

  /**
   * The SRV link changes for `numbers` once document `id` is stored as `doc`, or removed when `doc` is null: every
   * document of `kind` with those numbers is read in any FY and the domain resolves each citing item (INV-37).
   */
  async function relink(supplierId: string, id: string, numbers: readonly string[], doc: Doc | null) {
    const unique = [...new Set(numbers)];
    const stored = (await NUMBERED[kind](db, supplierId, unique)).filter((d) => d.id !== id);
    const docs = doc === null ? stored : [...stored, doc];
    return reresolveLinks(db, { supplierId, kind, numbers: unique, docs });
  }

  /** The create form's live check (D-0097): is `number`, trimmed as stored (D-0248), taken in the FY of `date`? */
  async function numberCheck(supplierId: string, { number, date }: { number: string; date: IsoDate }) {
    const financialYear = fyOf(date);
    const stored = await NUMBERED[kind](db, supplierId, [number.trim()]);
    return { taken: stored.some((d) => d.financialYear === financialYear), financialYear };
  }

  return { guardedRecompute, otherPos, relink, numberCheck };
}

export const commit = (db: Db, statements: readonly Statement[]) =>
  statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();
