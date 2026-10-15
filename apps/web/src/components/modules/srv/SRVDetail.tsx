import type { Money, Qty } from "@senstosales/domain";
import { srvLineShown, srvTotals } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { apiQuery } from "../../../lib/api.ts";
import { Loading } from "../../../lib/icons.ts";
import { Badge, type Column, DataTable, PageHeader } from "../../common/index.ts";
import { PoRef } from "./SRVList.tsx";

type Detail = RouteOutput<"srv.detail">;
type SrvItem = Detail["items"][number];
type PoItem = RouteOutput<"po.detail">["items"][number];
type Row = SrvItem & { readonly shown: ReturnType<typeof srvLineShown>; readonly poItem: PoItem | undefined };

/** The SRV page's raw header cell under one of `labels`, or "—" (EC-60: the page's first row only). */
const rawCell = (raw: Readonly<Record<string, string>>, ...labels: string[]): string => {
  const hit = Object.entries(raw).find(([k]) => labels.includes(k.toUpperCase().trim()));
  return hit?.[1].trim() || "—";
};

function InfoItem({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 role-field-label">{label}</div>
      <div className="truncate role-field-value">{value}</div>
    </div>
  );
}

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

const qty = (key: keyof Row["shown"] | "ordQty", header: string): Column<Row> => ({
  key,
  header,
  width: "88px",
  align: "right",
  render: (row) => <span className="tabular-nums">{fmtQty(key === "ordQty" ? row.ordQty : row.shown[key])}</span>,
});

function columns(flagsOf: (id: string) => Detail["flags"], gemc: boolean): Column<Row>[] {
  return [
    {
      key: "poItem",
      header: "PO Item",
      width: "80px",
      render: (r) => (r.lotNo ? `#${r.poItemNo}.${r.lotNo}` : `#${r.poItemNo}`),
    },
    { key: "srvItemNo", header: "SRV Item", width: "72px", render: (r) => String(r.srvItemNo) },
    // EC-60: the SRV line's revision is not stored.
    { key: "rev", header: "Rev", width: "56px", render: () => "—" },
    {
      key: "material",
      header: "Material",
      width: "240px",
      title: (r) => [r.materialCode, r.poItem?.description].filter(Boolean).join(" · "),
      render: (r) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 role-material-code">{r.materialCode ?? "—"}</span>
          <span className="truncate role-material-description">{r.poItem?.description ?? ""}</span>
        </span>
      ),
    },
    {
      key: "rate",
      header: "Unit Rate",
      width: "100px",
      align: "right",
      render: (r) => (r.poItem ? fmtRate(r.poItem.rate, { gemc }) : "—"),
    },
    { key: "unit", header: "Unit", width: "64px", render: (r) => r.poItem?.unit ?? "—" },
    qty("ordQty", "Ordered"),
    {
      key: "dspQty",
      header: "Dispatched",
      width: "88px",
      align: "right",
      title: () => "Dispatched against the PO item",
      render: (r) => <span className="tabular-nums">{r.poItem ? fmtQty(r.poItem.dspQty) : "—"}</span>,
    },
    qty("rcdQty", "Received"),
    qty("acceptedQty", "Accepted"),
    qty("rejQty", "Rejected"),
    {
      key: "flags",
      header: "Flags",
      width: "72px",
      render: (r) => {
        const flags = flagsOf(r.id);
        return (
          <Badge
            color="warning"
            size="sm"
            className={flags.length === 0 ? "invisible" : undefined}
            title={flags.map((f) => f.type.replaceAll("_", " ")).join(", ")}
          >
            {fmtCount(flags.length)}
          </Badge>
        );
      },
    },
  ];
}

/** The legacy "Receipt Details" grid; challan and invoice numbers are the first item's, as legacy showed them. */
function ReceiptDetails({ srv, first }: { readonly srv: Detail["srv"]; readonly first: SrvItem | undefined }) {
  return (
    <section aria-label="Receipt Details" className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 role-section-title">Receipt Details</h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4 lg:grid-cols-6">
        <InfoItem label="SRV Number" value={srv.srvNumber} />
        <InfoItem label="SRV Date" value={fmtDate(srv.srvDate)} />
        <InfoItem label="PO Reference" value={<PoRef poId={srv.poId} poNumber={srv.poNumber} />} />
        <InfoItem label="Division" value={rawCell(srv.rawHeader, "DIV", "DIV CODE", "DIVISION")} />
        <InfoItem
          label="Invoice No"
          value={
            <DocNumber number={first?.invoiceNo ?? null} to="/invoice/$id" id={first?.resolvedInvoiceId ?? null} />
          }
        />
        <InfoItem label="Invoice Date" value={fmtDate(first?.invoiceDate ?? null)} />
        <InfoItem
          label="Challan No"
          value={<DocNumber number={first?.challanNo ?? null} to="/dc/$id" id={first?.resolvedDcId ?? null} />}
        />
        <InfoItem label="Challan Date" value={fmtDate(first?.challanDate ?? null)} />
        <InfoItem label="CNote No" value={rawCell(srv.rawHeader, "CNOTE NO", "C NOTE NO")} />
        <InfoItem label="CNote Date" value={rawCell(srv.rawHeader, "CNOTE DATE", "C NOTE DATE")} />
        <InfoItem label="Finance Date" value={rawCell(srv.rawHeader, "FINANCE DATE", "FIN DATE")} />
        <InfoItem label="PMIR No" value={rawCell(srv.rawHeader, "PMIR NO")} />
      </div>
    </section>
  );
}

/** `/srv/:id` (SPEC-16 §2): the SRV, its items with the PO item's material and rate, and its flagged items. */
export function SRVDetail({ id }: { readonly id: string }) {
  const detail = useQuery(apiQuery("srv.detail", { params: { id } }));
  const poId = detail.data?.srv.poId ?? null;
  const po = useQuery({ ...apiQuery("po.detail", { params: { id: poId ?? "" } }), enabled: poId !== null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  if (!detail.data) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        {detail.isError ? (
          <p role="alert" className="role-empty-text text-error">
            {detail.error.message}
          </p>
        ) : (
          <Loading className="size-6 animate-spin text-accent" aria-label="Loading" />
        )}
      </div>
    );
  }

  const { srv, items, flags } = detail.data;
  const poItems = new Map((po.data?.items ?? []).map((i) => [i.id, i]));
  const rows: Row[] = items.map((item) => ({
    ...item,
    shown: srvLineShown(item),
    poItem: item.poItemId === null ? undefined : poItems.get(item.poItemId),
  }));
  const totals = srvTotals(
    rows.map((r) => ({
      ...r,
      poItem: r.poItem ? { id: r.poItem.id, ordQty: r.poItem.ordQty, rate: r.poItem.rate } : null,
    })),
  );
  const value: Money | null = poId !== null && po.data ? totals.value : null;
  const flagsOf = (itemId: string) => flags.filter((f) => f.scopeId === itemId);
  const ordered: Qty = totals.ordQty;
  const start = (page - 1) * pageSize;
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
            <span>{value === null ? "—" : fmtMoney(value, { gemc: false })}</span>
          </span>
        }
      />
      <ReceiptDetails srv={srv} first={items[0]} />
      <section aria-label="Line items" className="flex flex-col gap-2">
        <div className="flex items-center gap-6 px-1">
          <span className="role-section-title">Line Items</span>
          {(
            [
              ["Ordered", ordered],
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
        <DataTable
          columns={columns(flagsOf, po.data?.po.isGemc ?? false)}
          rows={rows.slice(start, start + pageSize)}
          total={rows.length}
          page={page}
          pageSize={pageSize}
          state="ready"
          emptyText="No items"
          onPage={setPage}
          onPageSize={(size) => {
            setPage(Math.floor(start / size) + 1);
            setPageSize(size);
          }}
          onSort={() => {}}
          rowHighlight={(r) => flagsOf(r.id).length > 0}
        />
      </section>
    </div>
  );
}
