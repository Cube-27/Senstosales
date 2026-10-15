// Delivery challans (SPEC-11 §2, §4.2): the create form's dispatchable items and DC create. No quantity blocks a save
// (C6, A-7): the only rejections are malformed lines (400), an unknown PO (404) and a DC or GC number taken in the FY
// (409). A create is one batch: the PO version guard, the DC and its lines, the SRV links to its number, the PO
// recompute with its flags, and the audit row (C4).
import type { Statement } from "@senstosales/db";
import { ConflictError as StaleVersionError, dc, dcItem, po, updateWithVersion, WriteBatch } from "@senstosales/db";
import type { Issue, IsoDate, Qty } from "@senstosales/domain";
import { defaultGc, fyOf, validateDcLines } from "@senstosales/domain";

import { ConflictError, fieldError, NotFoundError, ValidationError } from "../errors.ts";
import { newId } from "../ids.ts";
import { dcsNumbered, findDc, isNumberCollision } from "../repositories/dc.ts";
import { findPoRow, itemsOfPo } from "../repositories/po-list.ts";
import { findSupplier } from "../repositories/supplier.ts";
import { audit } from "./audit.ts";
import type { SupplierDeps } from "./index.ts";
import { reresolveLinks } from "./links.ts";
import { loadPoSnapshot, recomputeStatements } from "./recompute.ts";

type DcRow = typeof dc.$inferInsert;

/** The editable header fields, as the create body and the form defaults carry them. */
type Header = Omit<
  DcRow,
  "id" | "supplierId" | "poId" | "number" | "dcDate" | "financialYear" | "gcNumber" | "gcDate" | "version" | "createdAt"
>;

export type DcCreate = Header & {
  poId: string;
  number: string;
  dcDate: IsoDate;
  gcNumber: string | null;
  gcDate: IsoDate | null;
  items: { poItemId: string; dspQty: Qty }[];
};

/** Header fields the form starts blank; the supplier's own details are filled in. */
const BLANK_HEADER = {
  ourRef: null,
  departmentNo: null,
  consigneeName: null,
  consigneeGstin: null,
  consigneeAddress: null,
  inspectionCompany: null,
  ewayBillNo: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  modeOfTransport: null,
  remarks: null,
} satisfies Header;

/**
 * A create whose PO changed between its read and its commit is rebuilt from fresh rows; the guard makes it fail
 * instead of writing derived columns from rows it never saw. A bound keeps a PO that never settles from looping.
 */
const ATTEMPTS = 3;

export function dcService({ db, clock, supplierId }: Pick<SupplierDeps, "db" | "clock" | "supplierId">) {
  async function loadPo(poId: string) {
    const row = await findPoRow(db, poId);
    if (row === undefined) throw new NotFoundError("po-not-found", "This PO was not found.");
    return row;
  }

  /** One attempt: reads the PO, then builds and commits the batch. */
  async function createOnce(supplier: string, body: DcCreate, number: string) {
    // The version is read before the snapshot, so a PO changed in between fails the batch (D-0220, INV-95).
    const row = await loadPo(body.poId);
    const snapshot = await loadPoSnapshot(db, body.poId);
    const lines = body.items.map((item) => ({ poItemId: item.poItemId, qty: item.dspQty }));
    const issues = validateDcLines({ poItemIds: new Set(snapshot.items.map((i) => i.id)), lines });
    if (issues.length > 0) throw linesError(issues);

    const now = clock.now();
    const financialYear = fyOf(body.dcDate);
    const gc = gcOf(body, number);
    const { items, poId, gcNumber: _n, gcDate: _d, number: _raw, ...header } = body;
    const id = newId();
    const dcRow = { ...header, ...gc, id, supplierId: supplier, poId, number, financialYear, createdAt: now };
    const itemRows = items.map((item) => ({ id: newId(), supplierId: supplier, dcId: id, ...item, createdAt: now }));

    const stored = await dcsNumbered(db, supplier, [number]);
    const links = await reresolveLinks(db, {
      supplierId: supplier,
      kind: "dc",
      numbers: [number],
      docs: [...stored, { id, number, date: body.dcDate }],
    });
    const srvLines = snapshot.srvLines.map((l) =>
      links.changes.has(l.id) ? { ...l, resolvedDcId: links.changes.get(l.id)! } : l,
    );

    const statements: Statement[] = [
      // A DC is a user change to the PO's quantities: an edit or create built from the PO before it fails (D-0220).
      updateWithVersion(db, po, poId, row.version, {}),
      db.build.insert(dc).values(dcRow),
      db.build.insert(dcItem).values(itemRows),
      ...links.statements,
      ...recomputeStatements({ db, clock }, { ...snapshot, dcLines: [...snapshot.dcLines, ...itemRows], srvLines }),
      audit(db, now, {
        action: "dc.create",
        entityType: "dc",
        entityId: id,
        after: {
          poId,
          number,
          dcDate: body.dcDate,
          financialYear,
          ...gc,
          items: items.map(({ poItemId, dspQty }) => ({ poItemId, dspQty })),
        },
      }),
    ];
    await statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();
    return id;
  }

  /**
   * The 409 naming the number and the FY it is taken in (SPEC-11 §4.2). When the DC and GC numbers both collide, the
   * database names only one index, so the stored DCs decide, and a taken DC number is the one named.
   */
  async function numberTaken(supplier: string, body: DcCreate, number: string): Promise<ConflictError> {
    const fy = fyOf(body.dcDate);
    const taken = (await dcsNumbered(db, supplier, [number])).some((d) => fyOf(d.date) === fy);
    if (taken) return new ConflictError("dc-number-taken", `DC ${number} already exists in FY ${fy}.`);
    return new ConflictError("gc-number-taken", `GC ${gcOf(body, number).gcNumber} already exists in FY ${fy}.`);
  }

  return {
    /** The create form: the PO, header defaults and the PO's items with their balances (no cap, INV-32). */
    async dispatchable(poId: string) {
      const [row, items, supplier] = await Promise.all([loadPo(poId), itemsOfPo(db, poId), findSupplier(db)]);
      const defaults = {
        ...BLANK_HEADER,
        supplierName: supplier?.name ?? null,
        supplierAddress: supplier?.address ?? null,
        supplierGstin: supplier?.gstin ?? null,
        supplierContact: supplier?.contact ?? null,
      };
      return { po: { id: row.id, poNumber: row.poNumber, isGemc: row.isGemc }, defaults, items };
    },

    /** INV-32, INV-26, INV-22: stores the DC in its date's FY, or answers 400, 404 or 409 and writes nothing. */
    async create(body: DcCreate) {
      const supplier = await supplierId.require();
      // Numbers are looked up trimmed (INV-24), so they are stored trimmed: " 7 " and "7" are one DC number.
      const number = body.number.trim();
      if (number === "") throw fieldError("number-blank", "number", "Enter the DC number.");
      for (let attempt = 1; ; attempt++) {
        try {
          return (await findDc(db, await createOnce(supplier, body, number)))!;
        } catch (err) {
          if (isNumberCollision(err)) throw await numberTaken(supplier, body, number);
          const poChanged = err instanceof StaleVersionError && err.table === "po";
          if (!poChanged || attempt === ATTEMPTS) throw err;
        }
      }
    },
  };
}

export type DcService = ReturnType<typeof dcService>;

/** INV-26: the GC number and date, trimmed like the DC number; blank ones take the DC's. */
const gcOf = (body: DcCreate, number: string) =>
  defaultGc({ dcNumber: number, dcDate: body.dcDate, gcNumber: body.gcNumber?.trim() ?? null, gcDate: body.gcDate });

/** The 400 for invalid lines: the first issue's code, and every issue at its body path (SPEC-11 §4.3). */
function linesError(issues: readonly Issue[]): ValidationError {
  const path = (p: string) => `body.${p.replace(/^lines/, "items").replace(/\.qty$/, ".dspQty")}`;
  const fields = issues.map((issue) => ({ path: path(issue.path), message: issue.message }));
  return new ValidationError(issues[0]!.code, issues[0]!.message, { fields });
}
