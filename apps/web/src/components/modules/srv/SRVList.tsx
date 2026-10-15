import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtQty } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { AlertCircle, CheckCircle, Delete, Loading, Package, Upload } from "../../../lib/icons.ts";
import { rangeQuery } from "../../../lib/search.ts";
import { pickHtmlPages, uploadHtml } from "../../../lib/upload.ts";
import {
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  FileUploadModal,
  ListFilters,
  ListToolbar,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatCard,
  qtyColumn,
  StatCardRow,
  useToast,
} from "../../common/index.ts";
import { poSort, type SrvSearch, srvSort } from "./search.ts";

type SrvRow = RouteOutput<"srv.list">["items"][number];
type PoRow = RouteOutput<"srv.byPo">["items"][number];
type Totals = Pick<SrvRow, "ordQty" | "rcdQty" | "acceptedQty" | "rejQty" | "value">;

/** The PO an SRV names: a link when the PO is in the system, else "PO not found" (INV-40). */
export function PoRef({ poId, poNumber }: { readonly poId: string | null; readonly poNumber: string }) {
  if (poId === null) {
    return (
      <span className="inline-flex items-center gap-1.5" title={`PO ${poNumber} is not in the system`}>
        <span className="role-table-cell">{poNumber}</span>
        <Badge color="warning" size="sm">
          PO not found
        </Badge>
      </span>
    );
  }
  return (
    <Link to="/po/$id" params={{ id: poId }} className="role-reference-link">
      {poNumber}
    </Link>
  );
}

/** Ordered, Received, Accepted (shown as received, INV-09), Rejected and Value, as the legacy SRV lists end. */
const totalsColumns = <R extends Totals>(): Column<R>[] => [
  ...(
    [
      ["ordQty", "Ordered"],
      ["rcdQty", "Received"],
      ["acceptedQty", "Accepted"],
      ["rejQty", "Rejected"],
    ] as const
  ).map(([key, header]) => qtyColumn<R>(key, header, (row) => row[key], { sortable: true })),
  {
    key: "value",
    header: "Value",
    width: "120px",
    align: "right",
    sortable: true,
    render: (row) => fmtMoney(row.value, { gemc: false }),
  },
];

const srvLink = (row: Pick<SrvRow, "id" | "srvNumber">) => (
  <Link to="/srv/$id" params={{ id: row.id }} className="role-reference-link">
    {row.srvNumber}
  </Link>
);

/** A PO's SRVs (the by-PO view's expanded rows) in a popover over the row, so opening it moves nothing (C8). */
function PoSrvs({ row, search }: { readonly row: PoRow; readonly search: SrvSearch }) {
  const [open, setOpen] = useState(false);
  const query = {
    ...rangeQuery(search),
    poNumber: row.poNumber,
    pageSize: 100 as const,
    sort: "srvDate" as const,
    dir: "desc" as const,
  };
  const srvs = useQuery({ ...apiQuery("srv.list", { query }), enabled: open });
  const shown = srvs.data?.items ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2" aria-label={`SRVs for PO ${row.poNumber}`}>
          {fmtCount(row.srvCount)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[40rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="role-section-title">SRVs for PO {row.poNumber}</span>
          <span className="role-helper-text">{fmtCount(srvs.data?.total ?? row.srvCount)} row(s)</span>
        </div>
        <div className="h-64 overflow-y-auto">
          {srvs.isPending ? (
            <div role="status" className="flex h-full items-center justify-center gap-2 role-helper-text">
              <Loading className="size-4 animate-spin" aria-hidden />
              Loading SRVs for PO {row.poNumber}...
            </div>
          ) : srvs.isError ? (
            <p role="alert" className="p-4 role-helper-text text-error">
              {srvs.error.message}
            </p>
          ) : (
            <table className="w-full table-fixed border-collapse">
              <tbody>
                {shown.map((srv) => (
                  <tr key={srv.id} className="h-9 border-b border-border/40">
                    <td className="w-32 truncate px-3">{srvLink(srv)}</td>
                    <td className="w-24 px-3 role-table-cell">{fmtDate(srv.srvDate)}</td>
                    {(["ordQty", "rcdQty", "acceptedQty", "rejQty"] as const).map((key) => (
                      <td key={key} className="px-3 text-right role-table-cell tabular-nums">
                        {fmtQty(srv[key])}
                      </td>
                    ))}
                    <td className="w-28 px-3 text-right role-table-cell">{fmtMoney(srv.value, { gemc: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function srvColumns(onDelete: (row: SrvRow) => void): Column<SrvRow>[] {
  return [
    { key: "srvNumber", header: "SRV #", width: "120px", sortable: true, title: (r) => r.srvNumber, render: srvLink },
    { key: "srvDate", header: "Date", width: "100px", sortable: true, render: (r) => fmtDate(r.srvDate) },
    {
      key: "poNumber",
      header: "Purchase Order",
      width: "200px",
      sortable: true,
      title: (r) => r.poNumber,
      render: (r) => <PoRef poId={r.poId} poNumber={r.poNumber} />,
    },
    ...totalsColumns<SrvRow>(),
    {
      key: "actions",
      header: "Actions",
      width: "72px",
      align: "right",
      render: (r) => (
        <Button
          variant="outline"
          size="icon"
          title={`Delete SRV ${r.srvNumber}`}
          aria-label={`Delete SRV ${r.srvNumber}`}
          onClick={() => onDelete(r)}
        >
          <Delete className="text-error" aria-hidden />
        </Button>
      ),
    },
  ];
}

function poColumns(search: SrvSearch): Column<PoRow>[] {
  return [
    {
      key: "poNumber",
      header: "PO #",
      width: "200px",
      sortable: true,
      title: (r) => r.poNumber,
      render: (r) => <PoRef poId={r.poId} poNumber={r.poNumber} />,
    },
    { key: "latestSrvDate", header: "Date", width: "100px", sortable: true, render: (r) => fmtDate(r.latestSrvDate) },
    ...totalsColumns<PoRow>(),
    {
      key: "srvCount",
      header: "SRVs",
      width: "72px",
      align: "right",
      sortable: true,
      render: (r) => <PoSrvs row={r} search={search} />,
    },
  ];
}

/** The legacy KPI cards of both views. */
function SrvStats({ byPo, ranges }: { readonly byPo: boolean; readonly ranges: ReturnType<typeof rangeQuery> }) {
  const s = useQuery(apiQuery("srv.stats", { query: ranges })).data;
  return (
    <StatCardRow>
      <StatCard
        title={byPo ? "Total POs" : "Total SRVs"}
        value={s ? fmtCount(byPo ? s.poCount : s.srvCount) : "—"}
        icon={<Package className="size-4" />}
      />
      <StatCard title="Total Received" value={s ? fmtQty(s.rcdQty) : "—"} icon={<Package className="size-4" />} />
      <StatCard
        title="Total Accepted"
        value={s ? fmtQty(s.acceptedQty) : "—"}
        icon={<CheckCircle className="size-4" />}
        color="success"
      />
      <StatCard
        title="Total Rejected"
        value={s ? fmtQty(s.rejQty) : "—"}
        icon={<AlertCircle className="size-4" />}
        color="error"
      />
    </StatCardRow>
  );
}

/** Confirms and deletes one SRV; the dialog stays open with the server's message when the delete fails. */
function DeleteSrvDialog({
  row,
  onClose,
  onDeleted,
}: {
  readonly row: SrvRow | null;
  readonly onClose: () => void;
  readonly onDeleted: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(srv: SrvRow) {
    setBusy(true);
    setError(null);
    try {
      await api.request("srv.delete", { params: { id: srv.id } });
      toast("SRV deleted", `SRV ${srv.srvNumber} has been deleted successfully.`, "success");
      onClose();
      await onDeleted();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete SRV";
      setError(message);
      toast("Delete failed", message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={row !== null}
      onClose={() => {
        if (busy) return;
        setError(null);
        onClose();
      }}
      onConfirm={() => row && void confirm(row)}
      title="Delete Store Receipt Voucher?"
      warningText={row ? `Are you sure you want to delete SRV ${row.srvNumber}? This action cannot be undone.` : ""}
      message={error ? <p className="role-helper-text text-error">{error}</p> : undefined}
      confirmLabel="Delete SRV"
      variant="danger"
      loading={busy}
    />
  );
}

/** `/srv` (SPEC-16 §2): the legacy SRV list and its by-PO view, with upload and delete (never blocked, INV-35). */
export function SRVList() {
  const list = useListSearch<SrvSearch>();
  const { search, setFilters } = list;
  const byPo = search.view === "po";
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const paging = { page: search.page, pageSize: search.pageSize, dir: search.dir };
  const ranges = rangeQuery(search);
  const srvRows = useQuery({
    ...apiQuery("srv.list", { query: { ...paging, ...ranges, sort: srvSort(search.sort) } }),
    enabled: !byPo,
  });
  const poRows = useQuery({
    ...apiQuery("srv.byPo", { query: { ...paging, ...ranges, sort: poSort(search.sort) } }),
    enabled: byPo,
  });
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const [files, setFiles] = useState<readonly File[]>([]);
  const [deleting, setDeleting] = useState<SrvRow | null>(null);
  const refresh = () => invalidate("srv", "po");
  const srvCols = useMemo(() => srvColumns(setDeleting), []);
  const byPoCols = useMemo(() => poColumns(search), [search]);

  const showView = (view: "po" | undefined) =>
    void navigate({ to: "/srv", search: (prev) => ({ ...prev, view, sort: undefined, page: 1 }), replace: true });

  const active = byPo ? poRows : srvRows;
  const tableState = active.isError ? "error" : active.isFetching ? "loading" : "ready";
  const table = {
    ...list.table,
    state: tableState,
    error: active.error?.message,
    total: active.data?.total ?? 0,
  } as const;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Store Receipt Vouchers" subtitle="Track material receipts and inspections" />
      <SrvStats byPo={byPo} ranges={ranges} />
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: byPo ? "Search POs, SRVs..." : "Search SRVs, POs..." }}>
          <div role="group" aria-label="View" className="flex items-center gap-1 rounded-lg bg-surface-sunken/50 p-1">
            {(
              [
                [undefined, "SRV View"],
                ["po", "PO View"],
              ] as const
            ).map(([view, label]) => (
              <Button
                key={label}
                size="sm"
                variant={search.view === view ? "default" : "ghost"}
                aria-pressed={search.view === view}
                className="h-7"
                onClick={() => search.view !== view && showView(view)}
              >
                {label}
              </Button>
            ))}
          </div>
          <ListFilters dateLabel="SRV Date" value={search} onChange={setFilters} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void pickHtmlPages().then((picked) => picked && setFiles(picked))}
          >
            <Upload aria-hidden />
            Upload
          </Button>
        </ListToolbar>
        {byPo ? (
          <DataTable columns={byPoCols} rows={poRows.data?.items} emptyText="No grouped PO records found." {...table} />
        ) : (
          <DataTable columns={srvCols} rows={srvRows.data?.items} emptyText="No SRV records found." {...table} />
        )}
      </div>
      <FileUploadModal
        open={files.length > 0}
        files={files}
        title="Import SRV Data"
        onUpload={(file) => uploadHtml("srv.upload", file)}
        onClose={() => {
          setFiles([]);
          void refresh();
        }}
      />
      <DeleteSrvDialog row={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />
    </div>
  );
}
