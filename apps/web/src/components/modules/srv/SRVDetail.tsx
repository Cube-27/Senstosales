import { srvLineShown, srvTotals } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtFlagType, fmtMoney, fmtQty, fmtRate } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { useClientPage } from "../../../hooks/useClientPage.ts";
import { apiQuery } from "../../../lib/api.ts";
import { rawLookup } from "../../../lib/raw-header.ts";
import { Badge, type Column, DataTable, InfoField, PageHeader, qtyColumn, QueryState } from "../../common/index.ts";
import { PoRef } from "./SRVList.tsx";

type Detail = RouteOutput<"srv.detail">;
type SrvItem = Detail["items"][number];
type PoItem = RouteOutput<"po.detail">["items"][number];
type Flag = Detail["flags"][number];
type Row = SrvItem & { readonly shown: ReturnType<typeof srvLineShown>; readonly poItem: PoItem | null };

/** The SRV page's header cells the SRV keeps only in its raw header (EC-60), by the labels the page may print. */
const RAW = {
  division: ["DIV", "DIV CODE", "DIVISION"],
  cnoteNo: ["CNOTE NO", "C NOTE NO"],
  cnoteDate: ["CNOTE DATE", "C NOTE DATE"],
  financeDate: ["FINANCE DATE", "FIN DATE"],
  pmirNo: ["PMIR NO"],
} as const;

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
    qtyColumn<Row>("ordQty", "Ordered", (r) => r.ordQty, { width: "88px" }),
    {
      key: "dspQty",
      header: "Dispatched",
      width: "88px",
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
      width: "72px",
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

/** The legacy "Receipt Details" grid; challan and invoice numbers are the first item's, as legacy showed them. */
function ReceiptDetails({ srv, first }: { readonly srv: Detail["srv"]; readonly first: SrvItem | undefined }) {
  return (
    <section aria-label="Receipt Details" className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 role-section-title">Receipt Details</h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4 lg:grid-cols-6">
        <InfoField label="SRV Number" value={srv.srvNumber} />
        <InfoField label="SRV Date" value={fmtDate(srv.srvDate)} />
        <InfoField label="PO Reference" value={<PoRef poId={srv.poId} poNumber={srv.poNumber} />} />
        <InfoField label="Division" value={rawLookup(srv.rawHeader, RAW.division)} />
        <InfoField
          label="Invoice No"
          value={
            <DocNumber number={first?.invoiceNo ?? null} to="/invoice/$id" id={first?.resolvedInvoiceId ?? null} />
          }
        />
        <InfoField label="Invoice Date" value={fmtDate(first?.invoiceDate ?? null)} />
        <InfoField
          label="Challan No"
          value={<DocNumber number={first?.challanNo ?? null} to="/dc/$id" id={first?.resolvedDcId ?? null} />}
        />
        <InfoField label="Challan Date" value={fmtDate(first?.challanDate ?? null)} />
        <InfoField label="CNote No" value={rawLookup(srv.rawHeader, RAW.cnoteNo)} />
        <InfoField label="CNote Date" value={rawLookup(srv.rawHeader, RAW.cnoteDate)} />
        <InfoField label="Finance Date" value={rawLookup(srv.rawHeader, RAW.financeDate)} />
        <InfoField label="PMIR No" value={rawLookup(srv.rawHeader, RAW.pmirNo)} />
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
      <ReceiptDetails srv={srv} first={items[0]} />
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
