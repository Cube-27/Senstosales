// SPEC-05 PR 2: every ARCHITECTURE §8.2 table and column exists with its unit suffix and type, no column is REAL,
// and the unique indexes are the ones SPEC-05 §2 lists. Read from Drizzle's own table config, the source migration
// 0001 is generated from.
import { getTableConfig, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import * as schema from "../src/schema/index.ts";
import type { Instant } from "../src/types.ts";

const configs = Object.values(schema).map((t) => getTableConfig(t));

/** `name type`, plus ` not null`, ` pk` and ` default <value>` where they apply. */
function describeColumn(c: SQLiteColumn): string {
  const parts = [c.name, c.getSQLType()];
  if (c.notNull && !c.primary) parts.push("not null");
  if (c.primary) parts.push("pk");
  if (c.default !== undefined) parts.push(`default ${String(c.default)}`);
  return parts.join(" ");
}

const SUPPLIER = "supplier_id text not null";

const EXPECTED: Record<string, string[]> = {
  supplier: [
    "id text pk",
    "name text not null",
    "gstin text",
    "address text",
    "state text",
    "state_code text",
    "contact text",
    "email text",
    "bhel_supplier_code text",
    "bank_details_json text not null",
    "invoice_defaults_json text not null",
  ],
  settings: [SUPPLIER, "key text not null", "value text not null"],
  secret: [SUPPLIER, "name text not null", "value text not null"],
  buyer: ["id text pk", SUPPLIER, "unit_name text not null", "state text", "state_code text", "gstin text"],
  app_user: ["id text pk", "username text not null", "password_hash text not null", "password_changed_at text"],
  session: [
    "id text pk",
    "user_id text not null",
    "token_hash text not null",
    "created_at text not null",
    "expires_at text not null",
  ],
  source_document: [
    "id text pk",
    SUPPLIER,
    "kind text not null",
    "key text not null",
    "storage_key text not null",
    "sha256 text not null",
    "doc_date text",
    "ingested_at text not null",
    "job_id text",
  ],
  po: [
    "id text pk",
    SUPPLIER,
    "po_number text not null",
    "po_date text",
    "buyer_id text",
    "enquiry text",
    "quotation text",
    "order_type text",
    "bhel_status_code text",
    "amend_no integer not null",
    "po_value_u5 integer",
    "net_po_value_u5 integer",
    "is_gemc integer not null",
    "gemc_number text",
    "remarks text",
    "raw_header_json text not null",
    "status text not null",
    "ord_qty_m integer not null",
    "dsp_qty_m integer not null",
    "rcd_qty_m integer not null",
    "rej_qty_m integer not null",
    "balance_qty_m integer not null",
    "version integer not null default 1",
  ],
  po_item: [
    "id text pk",
    SUPPLIER,
    "po_id text not null",
    "po_item_no integer not null",
    "material_code text",
    "description text",
    "drawing_no text",
    "unit text",
    "ord_qty_m integer not null",
    "rate_source_u5 integer not null",
    "rate_u5 integer not null",
    "po_rcd_qty_m integer not null",
    "po_rej_qty_m integer",
    "cancelled_at text",
    "manual_dispatched_qty_m integer not null default 0",
    "manual_note text",
    "manual_set_at text",
    "dsp_qty_m integer not null",
    "rcd_qty_m integer not null",
    "rej_qty_m integer not null",
    "balance_qty_m integer not null",
    "uninvoiced_qty_m integer not null",
    "status text not null",
  ],
  po_lot: [
    "id text pk",
    SUPPLIER,
    "po_item_id text not null",
    "lot_no integer not null",
    "dely_qty_m integer not null",
    "dely_date text",
    "entry_allow_date text",
    "entry_allow_note text",
    "dest_code text",
  ],
  dc: [
    "id text pk",
    SUPPLIER,
    "po_id text not null",
    "number text not null",
    "dc_date text not null",
    "financial_year text not null",
    "gc_number text not null",
    "gc_date text not null",
    "our_ref text",
    "department_no text",
    "consignee_name text",
    "consignee_gstin text",
    "consignee_address text",
    "inspection_company text",
    "eway_bill_no text",
    "vehicle_no text",
    "lr_no text",
    "transporter text",
    "mode_of_transport text",
    "remarks text",
    "supplier_name text",
    "supplier_address text",
    "supplier_gstin text",
    "supplier_contact text",
    "version integer not null default 1",
    "created_at text not null",
  ],
  dc_item: [
    "id text pk",
    SUPPLIER,
    "dc_id text not null",
    "po_item_id text not null",
    "dsp_qty_m integer not null",
    "created_at text not null",
  ],
  invoice: [
    "id text pk",
    SUPPLIER,
    "po_id text not null",
    "dc_id text",
    "kind text not null",
    "number text not null",
    "invoice_date text not null",
    "financial_year text not null",
    "buyer_name text",
    "buyer_gstin text",
    "buyer_address text",
    "buyer_state text",
    "buyer_state_code text",
    "place_of_supply text",
    "buyers_order_date text",
    "gemc_number text",
    "gemc_date text",
    "payment_terms text",
    "despatch_doc_no text",
    "srv_no text",
    "srv_date text",
    "vehicle_no text",
    "lr_no text",
    "transporter text",
    "destination text",
    "terms_of_delivery text",
    "remarks text",
    "supplier_name text",
    "supplier_address text",
    "supplier_gstin text",
    "supplier_contact text",
    "cgst_pct_u5 integer not null",
    "sgst_pct_u5 integer not null",
    "taxable_u5 integer not null",
    "cgst_u5 integer not null",
    "sgst_u5 integer not null",
    "igst_u5 integer not null",
    "total_u5 integer not null",
    "version integer not null default 1",
    "created_at text not null",
  ],
  invoice_item: [
    "id text pk",
    SUPPLIER,
    "invoice_id text not null",
    "po_item_id text not null",
    "dc_item_id text",
    "qty_m integer not null",
    "rate_u5 integer not null",
    "taxable_u5 integer not null",
    "cgst_u5 integer not null",
    "sgst_u5 integer not null",
    "igst_u5 integer not null",
    "total_u5 integer not null",
  ],
  srv: [
    "id text pk",
    SUPPLIER,
    "po_number text not null",
    "po_id text",
    "srv_number text not null",
    "srv_date text not null",
    "financial_year text not null",
    "raw_header_json text not null",
  ],
  srv_item: [
    "id text pk",
    SUPPLIER,
    "srv_id text not null",
    "po_item_id text",
    "material_code text",
    "po_item_no integer not null",
    "lot_no integer not null",
    "srv_item_no integer not null",
    "ord_qty_m integer not null",
    "rcd_qty_m integer",
    "accepted_qty_m integer",
    "rej_qty_m integer",
    "challan_no text",
    "challan_date text",
    "invoice_no text",
    "invoice_date text",
    "resolved_dc_id text",
    "resolved_invoice_id text",
  ],
  reconciliation_issue: [
    "id text pk",
    SUPPLIER,
    "type text not null",
    "scope_type text not null",
    "scope_id text not null",
    "po_id text not null",
    "fingerprint text not null",
    "details_json text not null",
    "status text not null",
    "note text",
    "opened_at text not null",
    "acknowledged_at text",
  ],
  audit_log: [
    "id text pk",
    "at text not null",
    "actor text not null",
    "action text not null",
    "entity_type text not null",
    "entity_id text not null",
    "before_json text",
    "after_json text",
    "job_id text",
  ],
  job: [
    "id text pk",
    "type text not null",
    "status text not null",
    "created_at text not null",
    "started_at text",
    "finished_at text",
    "cancel_requested integer not null default false",
    "progress_json text not null",
    "error text",
    "summary_json text",
  ],
  job_event: [
    "id text pk",
    "job_id text not null",
    "at text not null",
    "level text not null",
    "document_key text",
    "message text not null",
  ],
  schema_migration: [
    "version integer pk",
    "name text not null",
    "applied_at text not null",
    "app_version text not null",
  ],
};

describe("§8.2 tables", () => {
  test("every table and column, with its type, nullability and default", () => {
    const actual = Object.fromEntries(configs.map((c) => [c.name, c.columns.map(describeColumn)]));
    expect(actual).toEqual(EXPECTED);
  });

  test("no column is REAL or NUMERIC (C3)", () => {
    const types = new Set(configs.flatMap((c) => c.columns.map((col) => col.getSQLType())));
    expect([...types].sort()).toEqual(["integer", "text"]);
  });

  test("unit-suffixed columns are integer-unit or branded-text columns", () => {
    const UNIT_SQL_TYPES: [RegExp, string][] = [
      [/(_qty_m|_u5)$/, "integer"],
      [/(_date|(^|_)at|^financial_year)$/, "text"],
    ];
    const mismatched = configs.flatMap((c) =>
      c.columns.flatMap((col) => {
        const sqlType = UNIT_SQL_TYPES.find(([suffix]) => suffix.test(col.name))?.[1];
        const ok = sqlType === undefined || (col.columnType === "SQLiteCustomColumn" && col.getSQLType() === sqlType);
        return ok ? [] : [`${c.name}.${col.name}`];
      }),
    );
    expect(mismatched).toEqual([]);
  });

  test("unit-suffixed columns carry the unit's brand", () => {
    // Every column whose name names a unit must read and write that unit's branded type; `never` means none differ.
    expectTypeOf<MisbrandedColumns<(typeof schema)[keyof typeof schema]>>().toEqualTypeOf<never>();
  });
});

type BrandOf<N> = N extends `${string}_qty_m`
  ? Qty
  : N extends `${string}_pct_u5`
    ? GstPct
    : N extends `${string}_u5`
      ? Money
      : N extends `${string}_date`
        ? IsoDate
        : N extends `${string}_at` | "at"
          ? Instant
          : N extends "financial_year"
            ? Fy
            : unknown;

type MisbrandedColumns<T> = T extends SQLiteTable
  ? {
      [K in keyof T["_"]["columns"]]: T["_"]["columns"][K]["_"] extends { name: infer N; data: infer D }
        ? [D] extends [BrandOf<N>]
          ? never
          : `${T["_"]["name"]}.${N & string}`
        : never;
    }[keyof T["_"]["columns"]]
  : never;

describe("indexes and checks", () => {
  test("unique indexes are exactly the ones SPEC-05 §2 lists", () => {
    const unique = configs.flatMap((c) =>
      c.indexes
        .filter((i) => i.config.unique)
        .map((i) => {
          const cols = i.config.columns.map((col) => (col as SQLiteColumn).name).join(", ");
          return `${c.name}(${cols})${i.config.where === undefined ? "" : " partial"}`;
        }),
    );
    expect(unique.sort()).toEqual([
      "dc(supplier_id, gc_number, financial_year)",
      "dc(supplier_id, number, financial_year)",
      "invoice(dc_id)",
      "invoice(supplier_id, number, financial_year)",
      "job(status) partial",
      "po(supplier_id, po_number)",
      "po_item(po_id, po_item_no)",
      "reconciliation_issue(fingerprint)",
      "srv(supplier_id, po_number, srv_number)",
    ]);
  });

  test("settings and secret are keyed by supplier; app_user and session by their unique names", () => {
    const keys = configs.flatMap((c) =>
      c.primaryKeys.map((pk) => `${c.name}(${pk.columns.map((col) => col.name).join(", ")})`),
    );
    expect(keys.sort()).toEqual(["secret(supplier_id, name)", "settings(supplier_id, key)"]);
    const uniqueColumns = configs.flatMap((c) =>
      c.columns.filter((col) => col.isUnique).map((col) => `${c.name}.${col.name}`),
    );
    expect(uniqueColumns.sort()).toEqual(["app_user.username", "session.token_hash"]);
  });

  test("manual dispatched quantity is never negative (A-15)", () => {
    const checks = configs.flatMap((c) => c.checks.map((ch) => `${c.name}.${ch.name}`));
    expect(checks).toEqual(["po_item.po_item_manual_dispatched_qty_m_check"]);
  });
});
