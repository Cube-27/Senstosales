// The report tabs' columns, with the legacy headers (SPEC-17 §2): Items Summary (pending) and Audit Ledger
// (reconciliation), whose rows carry the PO and PO item selection and export-selected use, and Daily Dispatch (A-16
// reversed), one row per DC line, with its workbook's columns.
import { fmtQty, type RouteOutput } from "@senstosales/schemas";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

import { cn } from "../../../lib/cn.ts";
import { Badge, type Column, qtyColumn } from "../../common/index.ts";

export type PendingRow = RouteOutput<"reports.pending">["items"][number];
export type ReconciliationRow = RouteOutput<"reports.reconciliation">["items"][number];
export type DispatchRow = RouteOutput<"reports.dispatch">["items"][number];
type Doc = PendingRow["dcs"][number];

const poLink = (r: { readonly poId: string; readonly poNumber: string }) => (
  <Link to="/po/$id" params={{ id: r.poId }} className="role-reference-link">
    {r.poNumber}
  </Link>
);

/** A cell of document links, comma-separated, or "-" without any. */
function DocLinks({ docs, to }: { readonly docs: readonly Doc[]; readonly to: "/dc/$id" | "/invoice/$id" }) {
  if (docs.length === 0) return "-";
  return docs.map((doc, i) => (
    <Fragment key={doc.id}>
      {i > 0 && ", "}
      <Link to={to} params={{ id: doc.id }} className="role-reference-link">
        {doc.number}
      </Link>
    </Fragment>
  ));
}

const numbers = (docs: readonly Doc[]) => docs.map((d) => d.number).join(", ");

export const PENDING_COLUMNS: Column<PendingRow>[] = [
  { key: "description", header: "Material", width: "28%", sortable: true },
  qtyColumn<PendingRow>("ordQty", "Qty", (r) => r.ordQty, { sortable: true, width: "80px" }),
  // No v1 column stores packets: 0, as the pending workbook writes (EC-41).
  { key: "packets", header: "Packets", width: "80px", align: "right", render: () => "0" },
  { key: "poNumber", header: "PO #", width: "120px", sortable: true, title: (r) => r.poNumber, render: poLink },
  {
    key: "gemcNumbers",
    header: "GEMC #",
    // One 15-digit GEMC number in its chip; more are cut inside the chip, with all of them in the title (D-0629).
    width: "188px",
    title: (r) => r.gemcNumbers.join(", "),
    render: (r) =>
      r.gemcNumbers.length === 0 ? (
        "-"
      ) : (
        <Badge size="sm" className="max-w-full role-reference-number-sm">
          <span className="truncate">{r.gemcNumbers.join(", ")}</span>
        </Badge>
      ),
  },
  {
    key: "invoices",
    header: "Invoice #",
    width: "120px",
    title: (r) => numbers(r.invoices),
    render: (r) => <DocLinks docs={r.invoices} to="/invoice/$id" />,
  },
  {
    key: "dcs",
    header: "Challan #",
    width: "120px",
    title: (r) => numbers(r.dcs),
    render: (r) => <DocLinks docs={r.dcs} to="/dc/$id" />,
  },
  // The legacy "Received" is the dispatched (delivered) quantity, as the workbook's Dispatch Delivered.
  // 92px keeps the tab's least width at 1000, so at 1280 it fills the page as the other tabs do (C8).
  qtyColumn<PendingRow>("dspQty", "Received", (r) => r.dspQty, { sortable: true, width: "92px" }),
];

export const RECONCILIATION_COLUMNS: Column<ReconciliationRow>[] = [
  { key: "poNumber", header: "PO Number", width: "140px", sortable: true, title: (r) => r.poNumber, render: poLink },
  { key: "description", header: "Material", width: "36%", sortable: true },
  qtyColumn<ReconciliationRow>("ordQty", "Ordered", (r) => r.ordQty, { sortable: true }),
  qtyColumn<ReconciliationRow>("dspQty", "Delivered", (r) => r.dspQty, { sortable: true }),
  // Accepted is the received quantity (INV-09).
  qtyColumn<ReconciliationRow>("rcdQty", "Received", (r) => r.rcdQty, { sortable: true }),
  {
    key: "rejQty",
    header: "Rejected",
    width: "90px",
    align: "right",
    sortable: true,
    render: (r) => (
      <span className={cn("tabular-nums", r.rejQty > 0 ? "text-error" : "text-tertiary")}>{fmtQty(r.rejQty)}</span>
    ),
  },
];

const dash = (text: string | null) => text ?? "-";

export const DISPATCH_COLUMNS: Column<DispatchRow>[] = [
  { key: "description", header: "Material", width: "28%" },
  {
    key: "dspQty",
    header: "Qty",
    width: "100px",
    align: "right",
    render: (r) => <span className="tabular-nums">{`${fmtQty(r.dspQty)} ${r.unit ?? ""}`.trim()}</span>,
  },
  { key: "packets", header: "Packets", width: "80px", align: "right", render: (r) => r.packets ?? "-" },
  { key: "poNumber", header: "PO #", width: "120px", title: (r) => r.poNumber, render: poLink },
  {
    key: "gemcNumber",
    header: "GEMC #",
    width: "152px",
    title: (r) => r.gemcNumber ?? "",
    render: (r) => dash(r.gemcNumber),
  },
  { key: "invoiceNumber", header: "Invoice #", width: "120px", render: (r) => dash(r.invoiceNumber) },
  {
    key: "dcNumber",
    header: "Challan #",
    width: "120px",
    render: (r) => (
      <Link to="/dc/$id" params={{ id: r.dcId }} className="role-reference-link">
        {r.dcNumber}
      </Link>
    ),
  },
  // The department the DC went to, as the owner's summaries fill the column.
  { key: "departmentNo", header: "Dispatch Delivered", width: "140px", render: (r) => dash(r.departmentNo) },
];
