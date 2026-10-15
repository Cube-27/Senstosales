import { srvLineShown, srvTotals } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtFlagType, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { useClientPage } from "../../../hooks/useClientPage.ts";
import { apiQuery } from "../../../lib/api.ts";
import {
  Badge,
  type Column,
  DataTable,
  InfoField,
  MaterialCell,
  materialTitle,
  PageHeader,
  qtyColumn,
  QueryState,
} from "../../common/index.ts";
import { PoRef } from "./SRVList.tsx";

type Detail = RouteOutput<"srv.detail">;
type SrvItem = Detail["items"][number];
type PoItem = RouteOutput<"po.detail">["items"][number];
type Flag = Detail["flags"][number];
type Row = SrvItem & { readonly shown: ReturnType<typeof srvLineShown>; readonly poItem: PoItem | null };

const NO_FLAGS: readonly Flag[] = [];

/** A challan or invoice number as the SRV printed it, a link when it resolved to our document (INV-38). */
function DocNumber({
  number,
  to,
  id,
}: {
  readonly number: string | null;
  readonly to: "/dc/$id" | "/invoice/$id";
  readonly id: string | null;
}) {
  if (number === null) return "—";
  if (id === null) return number;
  return (
    <Link to={to} params={{ id }} className="role-field-value-link">
      {number}
    </Link>
  );
}

const shownQty = (key: keyof Row["shown"], header: string) =>
  qtyColumn<Row>(key, header, (r) => r.shown[key], { width: "88px" });

function columns(flagsOf: (id: string) => readonly Flag[], gemc: boolean): Column<Row>[] {
  return [
    {
      key: "poItem",
      header: "PO Item",
      width: "76px",
      render: (r) => (r.lotNo ? `#${r.poItemNo}.${r.lotNo}` : `#${r.poItemNo}`),
    },
    { key: "srvItemNo", header: "SRV Item", width: "84px", render: (r) => String(r.srvItemNo) },
    { key: "rev", header: "Rev", width: "52px", render: (r) => r.revNo ?? "—" },
    {
      key: "material",
      header: "Material",
      width: "auto",
      title: (r) => materialTitle(r.materialCode, r.poItem?.description),
      render: (r) => <MaterialCell code={r.materialCode} description={r.poItem?.description} />,
    },
    {
      key: "rate",
      header: "Unit Rate",
      width: "92px",
      align: "right",
      render: (r) => (r.poItem ? fmtRate(r.poItem.rate, { gemc }) : "—"),
    },
    // The SRV's own UNIT as printed; a row stored without one shows the PO item's.
    { key: "unit", header: "Unit", width: "56px", render: (r) => r.unit ?? r.poItem?.unit ?? "—" },
    qtyColumn<Row>("ordQty", "Ordered", (r) => r.ordQty, { width: "88px" }),
    {
      key: "dspQty",
      header: "Dispatched",
      width: "104px",
      align: "right",
      title: () => "Dispatched against the PO item",
      render: (r) => <span className="tabular-nums">{r.poItem ? fmtQty(r.poItem.dspQty) : "—"}</span>,
    },
    shownQty("rcdQty", "Received"),
    shownQty("acceptedQty", "Accepted"),
    shownQty("rejQty", "Rejected"),
    {
      key: "flags",
      header: "Flags",
      width: "68px",
      render: (r) => {
        const flags = flagsOf(r.id);
        return (
          <Badge
            color="warning"
            size="sm"
            className={flags.length === 0 ? "invisible" : undefined}
            title={flags.map((f) => fmtFlagType(f.type)).join(", ")}
          >
            {fmtCount(flags.length)}
          </Badge>
        );
      },
    },
  ];
}

/** The first item's fields the receipt details show. */
type FirstRow = Pick<
  SrvItem,
  | "division"
  | "invoiceNo"
  | "invoiceDate"
  | "resolvedInvoiceId"
  | "challanNo"
  | "challanDate"
  | "resolvedDcId"
  | "cnoteNo"
  | "cnoteDate"
  | "financeDate"
  | "pmirNo"
>;

/** An SRV always has an item; this only keeps the grid's footprint if one ever has none. */
const NO_ROW: FirstRow = {
  division: null,
  invoiceNo: null,
  invoiceDate: null,
  resolvedInvoiceId: null,
  challanNo: null,
  challanDate: null,
  resolvedDcId: null,
  cnoteNo: null,
  cnoteDate: null,
  financeDate: null,
  pmirNo: null,
};

/** The legacy "Receipt Details" grid; the per-row fields are the first item's, as legacy showed them. */
function ReceiptDetails({ srv, first }: { readonly srv: Detail["srv"]; readonly first: FirstRow }) {
  return (
    <section aria-label="Receipt Details" className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 role-section-title">Receipt Details</h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4 lg:grid-cols-6">
        <InfoField label="SRV Number" value={srv.srvNumber} />
        <InfoField label="SRV Date" value={fmtDate(srv.srvDate)} />
        <InfoField label="PO Reference" value={<PoRef poId={srv.poId} poNumber={srv.poNumber} />} />
        <InfoField label="Division" value={first.division} />
        <InfoField
          label="Invoice No"
          value={<DocNumber number={first.invoiceNo} to="/invoice/$id" id={first.resolvedInvoiceId} />}
        />
        <InfoField label="Invoice Date" value={fmtDate(first.invoiceDate)} />
        <InfoField
          label="Challan No"
          value={<DocNumber number={first.challanNo} to="/dc/$id" id={first.resolvedDcId} />}
        />
        <InfoField label="Challan Date" value={fmtDate(first.challanDate)} />
        <InfoField label="CNote No" value={first.cnoteNo} />
        <InfoField label="CNote Date" value={fmtDate(first.cnoteDate)} />
        <InfoField label="Finance Date" value={fmtDate(first.financeDate)} />
        <InfoField label="PMIR No" value={first.pmirNo} />
      </div>
    </section>
  );
}

/** The SRV's lines with their PO items, totals and flags, paged on the client. */
function SRVView({ detail, po }: { readonly detail: Detail; readonly po: RouteOutput<"po.detail"> | undefined }) {
  const { srv, items, flags } = detail;
  const { rows, totals, flagsOf } = useMemo(() => {
    const poItems = new Map((po?.items ?? []).map((i) => [i.id, i]));
    const lines: Row[] = items.map((item) => ({
      ...item,
      shown: srvLineShown(item),
      poItem: (item.poItemId !== null && poItems.get(item.poItemId)) || null,
    }));
    const byItem = new Map<string, Flag[]>();
    for (const flag of flags) byItem.set(flag.scopeId, [...(byItem.get(flag.scopeId) ?? []), flag]);
    return {
      rows: lines,
      totals: srvTotals(lines),
      flagsOf: (itemId: string) => byItem.get(itemId) ?? NO_FLAGS,
    };
  }, [items, flags, po]);
  const gemc = po?.po.isGemc ?? false;
  const cols = useMemo(() => columns(flagsOf, gemc), [flagsOf, gemc]);
  const paged = useClientPage(rows);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={srv.srvNumber}
        backTo="/srv"
        subtitle={
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              PO: <PoRef poId={srv.poId} poNumber={srv.poNumber} />
            </span>
            <span className="opacity-40">•</span>
            <span>{items.length} items</span>
            <span className="opacity-40">•</span>
            <span>{po ? fmtMoney(totals.value, { gemc: false }) : "—"}</span>
          </span>
        }
      />
      <ReceiptDetails srv={srv} first={items[0] ?? NO_ROW} />
      <section aria-label="Line items" className="flex flex-col gap-2">
        <div className="flex items-center gap-6 px-1">
          <span className="role-section-title">Line Items</span>
          {(
            [
              ["Ordered", totals.ordQty],
              ["Received", totals.rcdQty],
              ["Accepted", totals.acceptedQty],
              ["Rejected", totals.rejQty],
            ] as const
          ).map(([label, q]) => (
            <span key={label} className="role-metadata">
              {label} <span className="role-field-value tabular-nums">{fmtQty(q)}</span>
            </span>
          ))}
        </div>
        <DataTable columns={cols} emptyText="No items" rowHighlight={(r) => flagsOf(r.id).length > 0} {...paged} />
      </section>
    </div>
  );
}

/** `/srv/:id` (SPEC-16 §2): the SRV, its items with the PO item's material and rate, and its flagged items. */
export function SRVDetail({ id }: { readonly id: string }) {
  const detail = useQuery(apiQuery("srv.detail", { params: { id } }));
  const poId = detail.data?.srv.poId ?? null;
  const po = useQuery({ ...apiQuery("po.detail", { params: { id: poId ?? "" } }), enabled: poId !== null });
  if (!detail.data) return <QueryState error={detail.error} />;
  return <SRVView detail={detail.data} po={po.data} />;
}
